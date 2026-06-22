// 기본 숙소 시드 데이터. 새 시즌 생성 시 자동 추가됨.
export type DefaultLodging = {
  name: string;
  building: "교육관" | "본당" | "기타";
  floor: string;
  capacity: number;
  note?: string;
  sort_order: number;
};

export const DEFAULT_LODGINGS: DefaultLodging[] = [
  // 교육관 2층
  { name: "식당 부속실", building: "교육관", floor: "2층", capacity: 20, sort_order: 1 },
  // 교육관 3층
  { name: "구역방", building: "교육관", floor: "3층", capacity: 15, sort_order: 10 },
  { name: "3청년회실", building: "교육관", floor: "3층", capacity: 100, sort_order: 11 },
  { name: "유치부실", building: "교육관", floor: "3층", capacity: 100, sort_order: 12 },
  { name: "1청년회실", building: "교육관", floor: "3층", capacity: 65, sort_order: 13 },
  // 교육관 4층
  { name: "초등2부실", building: "교육관", floor: "4층", capacity: 95, sort_order: 20 },
  { name: "초등1부실", building: "교육관", floor: "4층", capacity: 95, sort_order: 21 },
  { name: "고등부실", building: "교육관", floor: "4층", capacity: 95, sort_order: 22 },
  // 교육관 5층
  { name: "2청년회실", building: "교육관", floor: "5층", capacity: 100, sort_order: 30 },
  { name: "중등부실", building: "교육관", floor: "5층", capacity: 105, sort_order: 31 },
  // 본당 1층
  { name: "101호", building: "본당", floor: "1층", capacity: 32, sort_order: 40 },
  { name: "102호", building: "본당", floor: "1층", capacity: 15, sort_order: 41 },
  { name: "103호", building: "본당", floor: "1층", capacity: 25, sort_order: 42 },
  { name: "104호", building: "본당", floor: "1층", capacity: 25, sort_order: 43 },
  { name: "새가족교육실", building: "본당", floor: "1층", capacity: 45, sort_order: 44 },
  // 본당 2층
  { name: "201호", building: "본당", floor: "2층", capacity: 0, note: "에어컨 이슈", sort_order: 50 },
  { name: "202호", building: "본당", floor: "2층", capacity: 30, sort_order: 51 },
  { name: "203호", building: "본당", floor: "2층", capacity: 25, sort_order: 52 },
  { name: "204호", building: "본당", floor: "2층", capacity: 30, sort_order: 53 },
  // 본당 3층
  { name: "301호", building: "본당", floor: "3층", capacity: 40, sort_order: 60 },
  { name: "303호", building: "본당", floor: "3층", capacity: 40, sort_order: 61 },
  { name: "한글1", building: "본당", floor: "3층", capacity: 40, sort_order: 62 },
  { name: "한글2", building: "본당", floor: "3층", capacity: 40, sort_order: 63 },
  { name: "솔리데오", building: "본당", floor: "3층", capacity: 40, sort_order: 64 },
  // 기타
  { name: "유아실 좌측", building: "기타", floor: "-", capacity: 10, sort_order: 70 },
  { name: "유아실 우측", building: "기타", floor: "-", capacity: 20, sort_order: 71 },
  { name: "본당 3층(미정)", building: "기타", floor: "-", capacity: 0, note: "미정", sort_order: 72 },
];
