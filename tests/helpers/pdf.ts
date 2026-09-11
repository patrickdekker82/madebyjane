/**
 * Een echte, met de hand geschreven PDF. Geen externe asset en geen
 * bibliotheek: zo staat in de proef precies wat er in het bestand staat, en
 * kan de uitkomst van het omzetten er onafhankelijk tegen worden gehouden.
 */
export function makePdf(
  pages: { widthPt: number; heightPt: number; content?: string }[],
) {
  const objs: string[] = ["", ""]; // 1 = catalogus, 2 = paginaboom
  const kids: string[] = [];
  for (const page of pages) {
    const content = page.content ?? "0 0 0 rg 20 20 60 40 re f";
    const stream = objs.length + 1;
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.widthPt} ${page.heightPt}] /Contents ${stream + 1} 0 R /Resources << >> >>`,
    );
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(`${stream} 0 R`);
  }
  objs[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += String(o).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
