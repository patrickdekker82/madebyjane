import { useEffect, useState } from "react";
import { ApiError } from "./api";

/**
 * De beeldbank van de werkruimte.
 *
 * Onderleggers en moodboardbeelden staan in dezelfde opslag. De API wil de
 * werkruimte in een kopregel hebben, dus een gewone `<img src>` volstaat niet:
 * de bytes worden opgehaald en als tijdelijke verwijzing getoond. Die
 * verwijzing wordt weer ingetrokken zodra de afbeelding van het scherm is,
 * anders houdt de browser elk beeld dat je ooit zag in het geheugen.
 */
export type StoredImageInfo = {
  id: string;
  mime: string;
  widthPx: number;
  heightPx: number;
  createdAt: string;
};

export async function uploadImage(chosen: File, organizationId: string) {
  const assetId = crypto.randomUUID();
  const response = await fetch("/api/v1/underlay-assets/" + assetId, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "x-organization-id": organizationId,
      "Content-Type": "application/octet-stream",
    },
    body: await chosen.arrayBuffer(),
  });
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(body.code, body.message, response.status);
  // `rotation` komt uit de EXIF-oriëntatie die bij het opschonen uit het
  // bestand is gehaald. De draaiing zit dus niet meer in de bytes en moet in
  // de scène worden gezet, anders staat een staande foto liggend.
  return body as {
    id: string;
    mime: string;
    widthPx: number;
    heightPx: number;
    rotation: number;
  };
}

export function StoredImage({
  assetId,
  organizationId,
  alt,
}: {
  assetId: string;
  organizationId: string;
  alt: string;
}) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let object = "",
      cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/v1/underlay-assets/" + assetId, {
          credentials: "same-origin",
          headers: { "x-organization-id": organizationId },
        });
        if (!response.ok) throw new Error("niet gevonden");
        const blob = await response.blob();
        if (cancelled) return;
        object = URL.createObjectURL(blob);
        setUrl(object);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      setUrl("");
      if (object) URL.revokeObjectURL(object);
    };
  }, [assetId, organizationId]);
  if (failed)
    return (
      <span className="image-missing" role="img" aria-label={alt}>
        Niet gevonden
      </span>
    );
  // Zolang de bytes onderweg zijn staat er een lege plaats, geen half beeld.
  return url ? (
    <img src={url} alt={alt} />
  ) : (
    <span className="image-loading" role="img" aria-label={alt} />
  );
}
