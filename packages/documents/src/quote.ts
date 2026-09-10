import type { QuoteRecord } from "../../contracts/src/quotes";
import { escapeXml as e } from "./plan";
export const quoteTemplateVersion = "quote-1";
const eur = (s: string) => s.replace(".", ",") + " EUR";
export function quoteHtml(q: QuoteRecord) {
  const d = q.definition,
    t = q.totals;
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${e(q.number ?? "Concept")} - ${e(d.title)}</title><style>
 @page{size:A4 landscape;margin:16mm 17mm 18mm} @page plan{size:A4 landscape;margin:0}
 *{box-sizing:border-box}body{margin:0;color:#27392f;font:10pt Arial,sans-serif;line-height:1.45}h1{font:27pt Georgia,serif;margin:0 0 5mm}h2{font-size:13pt;margin:5mm 0 2mm}.brand{font-size:9pt;text-transform:uppercase;letter-spacing:2px;border-bottom:2px solid #536751;padding-bottom:3mm;margin-bottom:7mm}.meta{display:flex;justify-content:space-between;gap:10mm;margin:6mm 0}.meta>div{width:48%;overflow-wrap:anywhere}.prose{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;margin:5mm 0;table-layout:fixed}thead{display:table-header-group}th{text-align:left;font-size:8pt;background:#e9eee7;padding:2.5mm}td{border-bottom:1px solid #d7ded4;padding:2.5mm;vertical-align:top;overflow-wrap:anywhere;font-size:9pt}tr{break-inside:avoid}th:first-child{width:30%}.num{text-align:right}.totals{margin-left:auto;width:95mm;break-inside:avoid}.total{font-size:16pt;border-top:2px solid #536751;padding-top:3mm}.note{font-size:8pt;color:#536751}.attachment{break-before:page}.attachment article{break-inside:avoid;border-bottom:1px solid #d7ded4;padding-bottom:3mm}.plan{page:plan;break-before:page;width:297mm;height:210mm;overflow:hidden}.plan svg{display:block;width:297mm;height:210mm}.hash{font-size:7pt;overflow-wrap:anywhere}.section-title{break-after:avoid}
 </style></head><body><main><div class="brand">Offerte · ${e(q.number ?? "CONCEPT - niet definitief")} · versie ${q.version}</div><h1>${e(d.title)}</h1>
 <div class="meta"><div><strong>Van</strong><div class="prose">${e(d.seller ?? "")}</div></div><div><strong>Voor</strong><div class="prose">${e(d.customer)}</div></div></div>
 <p>Datum: ${e(d.date)} · Geldig tot: ${e(d.validUntil)} · Valuta: EUR</p>
 <table><thead><tr><th>Omschrijving</th><th class="num">Aantal</th><th>Eenheid</th><th class="num">Prijs excl.</th><th class="num">Korting</th><th class="num">Belasting</th><th class="num">Netto</th></tr></thead><tbody>${d.lines.map((l, i) => `<tr><td>${e(l.description)}</td><td class="num">${e(l.quantity.replace(".", ","))}</td><td>${e(l.unit)}</td><td class="num">${e(eur(l.unitPrice))}</td><td class="num">${e(l.discount)}%</td><td class="num">${e(l.taxCategory)} ${e(l.taxRate)}%</td><td class="num">${e(eur(t.lines[i]!.net))}</td></tr>`).join("")}</tbody></table>
 <div class="totals"><p>Subtotaal: <strong>${e(eur(t.net))}</strong></p>${t.taxes.map((t) => `<p>${e(t.category)} (${e(t.rate)}%): ${e(eur(t.tax))}</p>`).join("")}<p class="total">Totaal: ${e(eur(t.total))}</p></div>
 <p class="note">Netto per post afgerond op centen; belasting daarna per categorie. Halve centen worden van nul af afgerond.</p>
 ${d.terms ? `<h2 class="section-title">Voorwaarden</h2><div class="prose">${e(d.terms)}</div>` : ""}
 ${(q.frozen?.attachments ?? []).length ? `<h2 class="section-title">Vaste bijlagen</h2><ol>${q.frozen!.attachments.map((a) => `<li>${e(a.title)}</li>`).join("")}</ol>` : ""}
 <p class="hash">Documentinhoud: ${e(q.content_hash ?? "")} · Template ${quoteTemplateVersion}</p></main>
 ${(q.frozen?.attachments ?? []).map((a) => `<section class="${a.kind === "plan" ? "plan" : "attachment"}">${a.html}</section>`).join("")}</body></html>`;
}
