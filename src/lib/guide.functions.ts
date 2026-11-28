import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import { requireGuideAdmin, activeGuideSeason } from './guide-access.server';
import { GUIDE_BUCKET, GUIDE_MAX_IMAGE_BYTES, safeGuideUrl, validateGuideBody, validateGuideImage } from './guide-content';

export type PublicGuide = { body: string; seasonName: string; updatedAt: string | null };
const adminInput = z.object({ password: z.string().default(''), seasonId: z.string().uuid() });

export const getPublicGuide = createServerFn({ method: 'GET' }).handler(async (): Promise<PublicGuide> => {
  setResponseHeader('Cache-Control', 'no-store');
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  const season = await activeGuideSeason(db);
  if (!season) return { body: '', seasonName: '', updatedAt: null };
  const { data, error } = await db.from('season_guides').select('body, updated_at').eq('season_id', season.id).maybeSingle();
  if (error) throw new Error('안내문을 불러오지 못했습니다.');
  return { body: data?.body ?? '', seasonName: season.name, updatedAt: data?.updated_at ?? null };
});

export const getAdminGuide = createServerFn({ method: 'POST' }).inputValidator((d: unknown) => adminInput.parse(d)).handler(async ({ data }): Promise<PublicGuide> => {
  setResponseHeader('Cache-Control', 'no-store');
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  await requireGuideAdmin(db, data.password);
  const season = await activeGuideSeason(db, data.seasonId);
  if (!season) throw new Error('활성 시즌이 없습니다.');
  const { data: row, error } = await db.from('season_guides').select('body, updated_at').eq('season_id', season.id).maybeSingle();
  if (error) throw new Error('안내문을 불러오지 못했습니다.');
  return { body: row?.body ?? '', seasonName: season.name, updatedAt: row?.updated_at ?? null };
});

export const saveAdminGuide = createServerFn({ method: 'POST' }).inputValidator((d: unknown) => adminInput.extend({ body: z.string() }).parse(d)).handler(async ({ data }) => {
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  await requireGuideAdmin(db, data.password);
  await activeGuideSeason(db, data.seasonId);
  const body = validateGuideBody(data.body);
  const updatedAt = new Date().toISOString();
  const { error } = await db.from('season_guides').upsert({ season_id: data.seasonId, body, updated_at: updatedAt });
  if (error) throw new Error('안내문 저장에 실패했습니다.');
  return { updatedAt };
});

export const uploadGuideImage = createServerFn({ method: 'POST' }).inputValidator((d: unknown) => {
  if (!(d instanceof FormData)) throw new Error('올바른 이미지 요청이 아닙니다.');
  return d;
}).handler(async ({ data }) => {
  const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
  await requireGuideAdmin(db, typeof data.get('password') === 'string' ? String(data.get('password')) : '');
  const seasonId = z.string().uuid().parse(data.get('seasonId'));
  await activeGuideSeason(db, seasonId);
  const file = data.get('file');
  if (!(file instanceof File)) throw new Error('이미지를 선택해 주세요.');
  if (file.size > GUIDE_MAX_IMAGE_BYTES) throw new Error('이미지는 5MB 이하만 올릴 수 있습니다.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = validateGuideImage(file.type, bytes);
  const base = safeGuideUrl(import.meta.env.VITE_SUPABASE_URL ?? '');
  if (!base) throw new Error('이미지 주소 설정을 확인해 주세요.');
  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await db.storage.from(GUIDE_BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) throw new Error('이미지 저장소를 사용할 수 없습니다. 공개 저장소 설정을 확인해 주세요.');
  return { url: `${base.replace(/\/$/, '')}/storage/v1/object/public/${GUIDE_BUCKET}/${path}` };
});
