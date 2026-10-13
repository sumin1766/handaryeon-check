import { KOREA_MAP_PATHS } from "@/lib/korea-map-paths";
const left = ["서울특별시", "인천광역시", "경기도", "충청남도", "세종특별자치시", "대전광역시", "전북특별자치도", "광주광역시", "전라남도", "제주특별자치도"];
const right = ["강원특별자치도", "충청북도", "경상북도", "대구광역시", "울산광역시", "경상남도", "부산광역시"];
export const REGION_MAP_LABELS = [left, right].flatMap((names, side) => names.flatMap((name, index) => {
  const shape = KOREA_MAP_PATHS.find((p) => p.name === name);
  if (!shape) return [];
  const y = 22 + index * (side ? 78 : 57), x = side ? 895 : 5;
  return [{ name, center: shape.center, y, x, edge: side ? x : x + 205, elbow: side ? 720 + index * 4 : 322 - index * 4 }];
}));