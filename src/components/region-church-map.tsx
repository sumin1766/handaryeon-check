import { KOREA_MAP_PATHS } from "@/lib/korea-map-paths";
import { regionBins, regionLevel } from "@/lib/region-stats";
import { useRegionStats } from "@/lib/use-region-stats";
import { RegionLoadState } from "@/components/region-load-state";

const left = ["서울특별시", "인천광역시", "경기도", "충청남도", "세종특별자치시", "대전광역시", "전북특별자치도", "광주광역시", "전라남도", "제주특별자치도"];
const right = ["강원특별자치도", "충청북도", "경상북도", "대구광역시", "울산광역시", "경상남도", "부산광역시"];

export function RegionChurchMap() {
  const query = useRegionStats();
  if (query.isViewingPast) return null;
  const stats = query.data;
  if (!stats) return <RegionLoadState query={query} />;
  const bins = regionBins(stats.provinces);
  return (
    <section aria-labelledby="region-map-title" className="region-visual space-y-4 border-t border-border pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="region-map-title" className="lumina-section-title font-semibold">지역별 참석 교회</h2><p className="text-sm text-muted-foreground mt-1">{stats.seasonName}</p></div>
        <span className="region-total-badge">전국 합계 <strong>{stats.total.toLocaleString()}교회</strong></span>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_140px] items-center">
        <svg className="region-map w-full" viewBox="0 0 1100 620" role="img" aria-label={`전국 시도별 교회 수 지도, 전국 합계 ${stats.total}교회`}>
          <g className="region-map-shapes">
            {KOREA_MAP_PATHS.map((p) => <path key={p.name} d={p.d} className={`region-fill-${regionLevel(stats.provinces[p.name], bins)} region-boundary`}><title>{p.name}: {stats.provinces[p.name]}교회</title></path>)}
          </g>
          {[left, right].map((names, side) => names.map((name, index) => {
            const shape = KOREA_MAP_PATHS.find((p) => p.name === name);
            if (!shape) return null;
            const y = 22 + index * (side ? 78 : 57), x = side ? 895 : 5;
            const edge = side ? x : x + 205;
            const elbow = side ? 720 + index * 4 : 322 - index * 4;
            return <g className="region-leader-label" key={name}>
              <polyline points={`${shape.center[0]},${shape.center[1]} ${elbow},${shape.center[1]} ${edge},${y + 23}`} className="region-leader" />
              <circle cx={shape.center[0]} cy={shape.center[1]} r="2.5" className="region-anchor" />
              <rect x={x} y={y} width="200" height="46" rx="6" className="region-label-box" />
              <text x={x + 11} y={y + 19} className="region-label-name">{name}</text>
              <text x={x + 11} y={y + 37} className="region-label-count">{stats.provinces[name]}교회</text>
            </g>;
          }))}
        </svg>
        <aside aria-label="교회 수 범례" className="space-y-3">
          <h3 className="font-semibold text-sm">교회 수</h3>
          <div className="flex flex-wrap gap-x-5 gap-y-3 lg:flex-col">
            <div className="flex items-center gap-2 text-sm"><span className="region-swatch region-fill-0" />0교회 = 흰색</div>
            {bins.map((b) => <div key={b.min} className="flex items-center gap-2 text-sm"><span className={`region-swatch region-fill-${b.level}`} />{b.min === b.max ? b.min : `${b.min}–${b.max}`}교회</div>)}
          </div>
        </aside>
      </div>
      <div className="region-mobile-labels grid grid-cols-2 gap-2" aria-label="시도별 교회 수">
        {KOREA_MAP_PATHS.map((p) => <div className="region-mobile-label" key={p.name}><span className={`region-swatch region-fill-${regionLevel(stats.provinces[p.name], bins)}`} /><span>{p.name}<strong className="block">{stats.provinces[p.name]}교회</strong></span></div>)}
      </div>
      <p className="text-sm text-muted-foreground">미입력/미분류 <strong className="text-foreground">{stats.unknown}교회</strong></p>
    </section>
  );
}