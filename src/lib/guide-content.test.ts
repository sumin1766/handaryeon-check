import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { applyGuideBlock, applyGuideColor, parseGuide, parseGuideInline, safeGuideUrl, toggleGuideInline, validateGuideBody, validateGuideImage, GUIDE_MAX_IMAGE_BYTES } from './guide-content';

test('heading prefixes are distinct', () => assert.deepEqual(parseGuide('# A\n## B\n### C'), [{kind:'heading',text:'A'},{kind:'subheading',text:'B'},{kind:'heading3',text:'C'}]));
test('consecutive quotes form one block', () => assert.deepEqual(parseGuide('> A\n> B'), [{kind:'quote',text:'A\nB'}]));
test('information lines stay separate and preserve emoji', () => assert.deepEqual(parseGuide('! 📌 A\n! B'), [{kind:'info',text:'📌 A'},{kind:'info',text:'B'}]));
test('fold closes at next fold and explicit end', () => assert.deepEqual(parseGuide('[[A]]\n# X\n[[B]]\n! Y\n[[끝]]\nZ'), [{kind:'fold',title:'A',blocks:[{kind:'heading',text:'X'}]},{kind:'fold',title:'B',blocks:[{kind:'info',text:'Y'}]},{kind:'paragraph',text:'Z'}]));
test('https image extensions ignore query strings and case', () => assert.deepEqual(parseGuide('https://example.org/a.JPEG?x=1'), [{kind:'image',url:'https://example.org/a.JPEG?x=1'}]));
test('only this app guide bucket addresses are extensionless images', () => assert.deepEqual(parseGuide('https://app.example/storage/v1/object/public/guide-images/abc','https://app.example'), [{kind:'image',url:'https://app.example/storage/v1/object/public/guide-images/abc'}]));
test('other https addresses are links', () => assert.equal(parseGuide('https://example.org')[0]?.kind, 'link'));
test('http javascript and credential URLs are not allowed', () => { for(const url of ['http://example.org','javascript:alert(1)','https://user:pass@example.org']) assert.equal(safeGuideUrl(url),null); });
test('HTML and normal line breaks remain literal paragraphs', () => assert.deepEqual(parseGuide('<script>alert(1)</script>\nA\nB'), [{kind:'paragraph',text:'<script>alert(1)</script>'},{kind:'paragraph',text:'A'},{kind:'paragraph',text:'B'}]));

test('bullet and ordered lines form lists', () => assert.deepEqual(parseGuide('- A\n- B\n1. C\n2. D'), [
  {kind:'list',ordered:false,items:[{text:'A'},{text:'B'}]},
  {kind:'list',ordered:true,items:[{text:'C'},{text:'D'}]},
]));
test('a standalone divider is parsed', () => assert.deepEqual(parseGuide('A\n---\nB'), [{kind:'paragraph',text:'A'},{kind:'divider'},{kind:'paragraph',text:'B'}]));
test('line colors precede existing block markers', () => assert.deepEqual(parseGuide('{배경:분홍}! 날짜\n{빨강}## 1. 본당'), [
  {kind:'info',text:'날짜',background:'분홍'},
  {kind:'subheading',text:'1. 본당',color:'빨강'},
]));
test('both line colors work in either order', () => assert.deepEqual(parseGuide('{파랑}{배경:노랑}A\n{배경:노랑}{파랑}B'), [
  {kind:'paragraph',text:'A',color:'파랑',background:'노랑'},
  {kind:'paragraph',text:'B',color:'파랑',background:'노랑'},
]));
test('unknown colors and unmatched braces remain literal', () => assert.deepEqual(parseGuide('{임의}A\n{빨강A'), [{kind:'paragraph',text:'{임의}A'},{kind:'paragraph',text:'{빨강A'}]));
test('inline bold underline and highlights are parsed', () => assert.deepEqual(parseGuideInline('**굵게** __밑줄__ {빨강|글자} {배경:노랑|형광펜}'), [
  {text:'굵게',bold:true},{text:' '},{text:'밑줄',underline:true},{text:' '},{text:'글자',color:'빨강'},{text:' '},{text:'형광펜',background:'노랑'},
]));
test('bold and underline work inside color markers', () => assert.deepEqual(parseGuideInline('{빨강|**반드시 __지참__**}'), [{text:'반드시 ',color:'빨강',bold:true},{text:'지참',color:'빨강',bold:true,underline:true}]));
test('invalid inline colors and unmatched markers remain literal', () => {
  assert.equal(parseGuideInline('{임의|글자} **짝없음 __짝없음').map((part) => part.text).join(''), '{임의|글자} **짝없음 __짝없음');
});
test('inline formatting works inside folds', () => assert.deepEqual(parseGuide('[[A]]\n{초록}- **항목**')[0], {kind:'fold',title:'A',blocks:[{kind:'list',ordered:false,items:[{text:'**항목**',color:'초록'}]}]}));

test('block toolbar replaces prefixes on every selected line', () => {
  const body = '# A\n- B\nC';
  assert.deepEqual(applyGuideBlock(body,{start:0,end:body.length},'ordered'), {body:'1. A\n2. B\n3. C',start:0,end:14});
  assert.deepEqual(applyGuideBlock('### A',{start:0,end:4},'heading3'), {body:'### A',start:0,end:5});
});
test('fold and divider toolbar insert fixed markers', () => {
  assert.equal(applyGuideBlock('A',{start:0,end:1},'fold').body, '[[제목]]\nA\n[[끝]]');
  assert.equal(applyGuideBlock('A\nB',{start:0,end:3},'divider').body, '---');
});
test('inline color applies and default removes only its own wrapper', () => {
  const colored = applyGuideColor('안녕',{start:0,end:2},'color','빨강');
  assert.equal(colored.body,'{빨강|안녕}');
  assert.equal(applyGuideColor(colored.body,{start:colored.start,end:colored.end},'color','default').body,'안녕');
  const highlighted = applyGuideColor('안녕',{start:0,end:2},'background','노랑');
  assert.equal(highlighted.body,'{배경:노랑|안녕}');
  assert.equal(applyGuideColor(highlighted.body,{start:highlighted.start,end:highlighted.end},'background','default').body,'안녕');
});
test('line color applies to multiple lines and preserves blocks', () => {
  const body = '# A\n! B';
  const colored = applyGuideColor(body,{start:0,end:body.length},'background','분홍');
  assert.equal(colored.body,'{배경:분홍}# A\n{배경:분홍}! B');
  assert.equal(applyGuideColor(colored.body,{start:0,end:colored.body.length},'background','default').body,body);
});
test('bold and underline toggle without losing selected text', () => {
  const bold = toggleGuideInline('안녕',{start:0,end:2},'**');
  assert.deepEqual(bold,{body:'**안녕**',start:2,end:4});
  assert.equal(toggleGuideInline(bold.body,{start:bold.start,end:bold.end},'**').body,'안녕');
  assert.equal(toggleGuideInline('__안녕__',{start:0,end:7},'__').body,'안녕');
});

test('body accepts exactly 20000 characters', () => assert.equal(validateGuideBody('x'.repeat(20000)).length,20000));
test('body rejects more than 20000 characters', () => assert.throws(() => validateGuideBody('x'.repeat(20001))));
test('jpg png webp signatures accepted', () => { assert.equal(validateGuideImage('image/jpeg',new Uint8Array([255,216,255])),'jpg'); assert.equal(validateGuideImage('image/png',new Uint8Array([137,80,78,71,13,10,26,10])),'png'); assert.equal(validateGuideImage('image/webp',new TextEncoder().encode('RIFFxxxxWEBP')),'webp'); });
test('wrong mime and disguised images rejected', () => { assert.throws(() => validateGuideImage('image/gif',new Uint8Array([255,216,255]))); assert.throws(() => validateGuideImage('image/png',new TextEncoder().encode('<script>'))); });
test('5MB is allowed but 5MB plus one byte rejected', () => { const bytes = new Uint8Array(GUIDE_MAX_IMAGE_BYTES); bytes.set([255,216,255]); assert.equal(validateGuideImage('image/jpeg',bytes),'jpg'); assert.throws(() => validateGuideImage('image/jpeg',new Uint8Array(GUIDE_MAX_IMAGE_BYTES+1))); });
