type Address = { province?: unknown; city?: unknown; district?: unknown; township?: unknown };

export function formatPlace(address: Address, accuracy: number): string | null {
  const clean = (value: unknown) => typeof value === "string" ? value.replace(/[<>\r\n]/g, "").slice(0, 20) : "";
  const province = clean(address.province);
  const city = clean(address.city) || province;
  const district = clean(address.district);
  if (!city && !district) return null;
  return `${city}${accuracy > 5000 ? "" : district}`.slice(0, 40);
}

export async function resolvePlace(latitude: number, longitude: number, accuracy: number, source: "gps" | "autonavi", key: string): Promise<string | null> {
  let point = `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    if (source === "gps") {
      const converted = new URL("https://restapi.amap.com/v3/assistant/coordinate/convert");
      converted.search = new URLSearchParams({ key, locations: point, coordsys: "gps", output: "json" }).toString();
      const response = await fetch(converted, { signal: controller.signal, cache: "no-store" });
      const json = await response.json();
      if (!response.ok || json.status !== "1" || typeof json.locations !== "string") throw new Error("coordinate_conversion_failed");
      point = json.locations;
    }
    const url = new URL("https://restapi.amap.com/v3/geocode/regeo");
    url.search = new URLSearchParams({ key, location: point, extensions: "base", output: "json" }).toString();
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    const json = await response.json();
    if (!response.ok || json.status !== "1") throw new Error("reverse_geocoding_failed");
    return formatPlace(json.regeocode?.addressComponent ?? {}, accuracy);
  } finally { clearTimeout(timer); }
}
