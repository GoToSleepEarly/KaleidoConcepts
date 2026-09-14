import type { EnglishLevel } from "@/lib/contracts/api";

export function recommendedEnglishLevelForStudentAges(ages: number[]): EnglishLevel | null {
  if (!ages.length) return null;

  const averageAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;
  if (averageAge < 8) return "Starter";
  if (averageAge < 9) return "A1";
  if (averageAge < 12) return "A2";
  if (averageAge < 14) return "B1";
  return "B2";
}
