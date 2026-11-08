import { getCantons, getDistricts, getProvinces, isValidDistrict } from "@juniorov/cr-locations";

/**
 * Costa Rica's provinces, cantons and districts with Hacienda's codes (province 1–7, canton and
 * district 01…), for the issuer's address. Server-only: the full list never reaches the bundle.
 */
export interface DistrictOption {
  /** `1-02-03`: province, canton and district. */
  value: string;
  province: string;
  /** "San Rafael, Escazú". */
  label: string;
}

export function provinces(): { value: string; label: string }[] {
  return getProvinces().map((province) => ({ value: province.id, label: province.name }));
}

export function districts(): DistrictOption[] {
  return getProvinces().flatMap((province) =>
    getCantons(province.id).flatMap((canton) =>
      getDistricts(province.id, canton.id).map((district) => ({
        value: `${province.id}-${canton.id}-${district.id}`,
        province: province.id,
        label: `${district.name}, ${canton.name}`,
      })),
    ),
  );
}

export function isDistrict(province: string, canton: string, district: string): boolean {
  return isValidDistrict(province, canton, district);
}
