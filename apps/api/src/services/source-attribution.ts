export interface SourceAttribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  yclid?: string;
}

export interface StoredSourceAttribution {
  firstPageUrl?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
}

const clean = (value: string | null | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 500) : undefined;
};

export function attributionFromUrl(value: string | null | undefined): SourceAttribution {
  if (!value) return {};
  let url: URL;
  try { url = new URL(value); }
  catch { return {}; }
  return {
    utmSource: clean(url.searchParams.get("utm_source")),
    utmMedium: clean(url.searchParams.get("utm_medium")),
    utmCampaign: clean(url.searchParams.get("utm_campaign")),
    utmContent: clean(url.searchParams.get("utm_content")),
    utmTerm: clean(url.searchParams.get("utm_term")),
    gclid: clean(url.searchParams.get("gclid")),
    yclid: clean(url.searchParams.get("yclid")),
  };
}

export function sourceAttribution(stored: StoredSourceAttribution): SourceAttribution {
  const fromUrl = attributionFromUrl(stored.firstPageUrl);
  return {
    utmSource: clean(stored.utmSource) ?? fromUrl.utmSource,
    utmMedium: clean(stored.utmMedium) ?? fromUrl.utmMedium,
    utmCampaign: clean(stored.utmCampaign) ?? fromUrl.utmCampaign,
    utmContent: clean(stored.utmContent) ?? fromUrl.utmContent,
    utmTerm: clean(stored.utmTerm) ?? fromUrl.utmTerm,
    gclid: fromUrl.gclid,
    yclid: fromUrl.yclid,
  };
}

export function sourceEventMetadata(source: SourceAttribution): Record<string, string> | undefined {
  const metadata = {
    ...(source.utmSource ? { utm_source: source.utmSource } : {}),
    ...(source.utmCampaign ? { utm_campaign: source.utmCampaign } : {}),
    ...(source.utmContent ? { utm_content: source.utmContent } : {}),
  };
  return Object.keys(metadata).length ? metadata : undefined;
}
