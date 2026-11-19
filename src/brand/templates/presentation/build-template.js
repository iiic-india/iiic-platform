// IIIC presentation template · 1.0.3 · builds iiic-template.pptx
// Run: PPTX_SKILL=<path to the pptx skill> node build-template.js   (from this folder)
// Theme colours come from ../../tokens.json. Fonts: Georgia for titles, Arial for text
// (Fraunces and Manrope are the web faces; see README). No layout is dark: yellow sits on
// white and paper, type is ink. Layouts: title, section, content, content on paper, closing.
const pptxgen = require("pptxgenjs");
const path = require("path");
const { applyTheme } = require(path.join(process.env.PPTX_SKILL || "/mnt/skills/public/pptx", "scripts/apply_theme.js"));
const tokens = require("../../tokens.json");
const hex = (h) => h.replace("#", "");
const c = tokens.color;

const THEME = {
  name: "IIIC",
  headFontFace: "Georgia",
  bodyFontFace: "Arial",
  colors: {
    dk1: hex(c.ink), lt1: hex(c.white), dk2: hex(c.slate), lt2: hex(c.paper),
    accent1: hex(c.yellow), accent2: hex(c.slate), accent3: hex(c.yellow050), accent4: hex(c.slate500),
    accent5: hex(c.success), accent6: hex(c.danger), hlink: hex(c.ink), folHlink: hex(c.slate),
  },
};

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 × 7.5 in
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.author = "Indian Institute of Image Catalysts";
pres.company = "Indian Institute of Image Catalysts";
pres.title = "IIIC presentation template";
const C = pres.SchemeColor;
const PNG = path.resolve(__dirname, "../../logo/png");
const MARK = path.join(PNG, "mark-600.png");        // 337 × 600
const LOGO = path.join(PNG, "logo-1200.png");       // 1200 × 817
const markSize = (h) => ({ w: +(h * 337 / 600).toFixed(3), h });
const logoSize = (h) => ({ w: +(h * 1200 / 817).toFixed(3), h });

// Footer on every content layout: mark, name, slide number
const footerObjects = () => [
  { image: { path: MARK, x: 0.6, y: 6.78, ...markSize(0.42) } },
  { text: { text: "Indian Institute of Image Catalysts", options: { x: 0.95, y: 6.78, w: 6, h: 0.42, fontSize: 10, color: C.accent4, margin: 0, valign: "middle" } } },
];
const slideNumber = { x: 12.1, y: 6.78, w: 0.6, h: 0.42, fontSize: 10, color: C.accent4, align: "right" };

// TITLE · the yellow field with ink type; the logo on a white base
pres.defineSlideMaster({
  title: "TITLE", background: { color: C.accent1 },
  objects: [
    { rect: { x: 0, y: 5.9, w: 13.333, h: 1.6, fill: { color: C.background1 }, line: { color: C.background1 } } },
    { image: { path: LOGO, x: 0.7, y: 6.12, ...logoSize(1.15) } },
    { placeholder: { options: { name: "kicker", type: "body", x: 0.7, y: 0.75, w: 11.9, h: 0.4, fontSize: 12, bold: true, charSpacing: 3, color: C.text1, margin: 0 }, text: "Kicker" } },
    { placeholder: { options: { name: "title", type: "title", align: "left", x: 0.7, y: 2.4, w: 10.5, h: 2.0, fontSize: 44, color: C.text1, margin: 0, valign: "bottom", fontFace: "Georgia" }, text: "Title" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.7, y: 4.5, w: 9, h: 1.1, fontSize: 16, color: C.text1, margin: 0, valign: "top" }, text: "Subtitle" } },
    { placeholder: { options: { name: "meta", type: "body", x: 7.3, y: 6.3, w: 5.3, h: 0.8, fontSize: 11, color: C.accent4, margin: 0, align: "right", valign: "middle" }, text: "Date · presenter" } },
  ],
});

// SECTION · paper, the bar beside the title
pres.defineSlideMaster({
  title: "SECTION", background: { color: C.background2 },
  objects: [
    { rect: { x: 0.7, y: 2.75, w: 0.12, h: 1.9, fill: { color: C.accent1 }, line: { color: C.accent1 } } },
    { placeholder: { options: { name: "kicker", type: "body", x: 1.1, y: 2.75, w: 11.3, h: 0.4, fontSize: 12, bold: true, charSpacing: 3, color: C.text2, margin: 0 }, text: "Section" } },
    { placeholder: { options: { name: "title", type: "title", align: "left", x: 1.1, y: 3.15, w: 11.3, h: 1.5, fontSize: 40, color: C.text1, margin: 0, valign: "top", fontFace: "Georgia" }, text: "Section title" } },
    { image: { path: MARK, x: 0.7, y: 6.6, ...markSize(0.5) } },
  ],
});

// CONTENT · white
pres.defineSlideMaster({
  title: "CONTENT", background: { color: C.background1 }, slideNumber,
  objects: [
    { placeholder: { options: { name: "title", type: "title", align: "left", x: 0.7, y: 0.55, w: 11.9, h: 0.95, fontSize: 30, color: C.text1, margin: 0, valign: "top", fontFace: "Georgia" }, text: "Slide title" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.7, y: 1.7, w: 11.9, h: 4.8, fontSize: 16, color: C.text1, margin: 0, valign: "top", paraSpaceAfter: 8 }, text: "Body" } },
    ...footerObjects(),
  ],
});

// CONTENT_PAPER · the paper wash, for stats and cards
pres.defineSlideMaster({
  title: "CONTENT_PAPER", background: { color: C.background2 }, slideNumber,
  objects: [
    { placeholder: { options: { name: "title", type: "title", align: "left", x: 0.7, y: 0.55, w: 11.9, h: 0.95, fontSize: 30, color: C.text1, margin: 0, valign: "top", fontFace: "Georgia" }, text: "Slide title" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.7, y: 1.7, w: 11.9, h: 4.8, fontSize: 16, color: C.text1, margin: 0, valign: "top", paraSpaceAfter: 8 }, text: "Body" } },
    ...footerObjects(),
  ],
});

// CLOSING · the yellow field again, contact on the white base
pres.defineSlideMaster({
  title: "CLOSING", background: { color: C.accent1 },
  objects: [
    { rect: { x: 0, y: 5.9, w: 13.333, h: 1.6, fill: { color: C.background1 }, line: { color: C.background1 } } },
    { image: { path: LOGO, x: 0.7, y: 6.12, ...logoSize(1.15) } },
    { placeholder: { options: { name: "title", type: "title", align: "left", x: 0.7, y: 2.2, w: 11, h: 1.6, fontSize: 48, color: C.text1, margin: 0, valign: "bottom", fontFace: "Georgia" }, text: "Thank you" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.7, y: 3.95, w: 10, h: 1.2, fontSize: 16, color: C.text1, margin: 0, valign: "top" }, text: "One line on what happens next" } },
    { placeholder: { options: { name: "meta", type: "body", x: 6.3, y: 6.3, w: 6.3, h: 0.8, fontSize: 11, color: C.accent4, margin: 0, align: "right", valign: "middle" }, text: "Contact" } },
  ],
});

// Helpers composed on the content layouts
const card = (slide, x, y, w, h, tint) => slide.addShape(pres.ShapeType.roundRect, {
  x, y, w, h, rectRadius: 0.16,
  fill: { color: tint === "yellow" ? C.accent3 : C.background1 },
  line: { color: tint === "yellow" ? "FFE866" : "E4E8EA", width: 0.75 },
});
const statCard = (slide, x, y, w, value, label) => {
  card(slide, x, y, w, 2.3, "yellow");
  slide.addText(value, { x: x + 0.35, y: y + 0.3, w: w - 0.7, h: 1.2, fontSize: 52, fontFace: "Georgia", color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "stat-value" });
  slide.addText(label, { x: x + 0.35, y: y + 1.55, w: w - 0.7, h: 0.5, fontSize: 14, color: C.accent4, margin: 0, isTextBox: true, objectName: "stat-label" });
};
const stepCircle = (slide, x, y, n) => {
  slide.addShape(pres.ShapeType.ellipse, { x, y, w: 0.6, h: 0.6, fill: { color: C.accent1 }, line: { color: C.accent1 } });
  slide.addText(String(n), { x, y, w: 0.6, h: 0.6, fontSize: 16, bold: true, color: C.text1, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: `step-${n}` });
};

// Sample slides (one per layout; replace the text, keep the structure)
pres.addSection({ title: "Template" });
let s = pres.addSlide({ masterName: "TITLE", sectionTitle: "Template" });
s.addText("Proposal for [[client]]", { placeholder: "kicker" });
s.addText("[[Presentation title]]", { placeholder: "title" });
s.addText("[[Subtitle: one sentence on what this deck decides]]", { placeholder: "body" });
s.addText("[[date]] · [[presenter]], [[title]]", { placeholder: "meta" });
s.addNotes("Title layout. Replace kicker, title, subtitle and the meta line. Logo and background are on the layout.");

s = pres.addSlide({ masterName: "SECTION", sectionTitle: "Template" });
s.addText("Section 01", { placeholder: "kicker" });
s.addText("[[Section title]]", { placeholder: "title" });

s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Template" });
s.addText("[[Content slide: title]]", { placeholder: "title" });
s.addText([
  { text: "[[First point]]", options: { bullet: true, breakLine: true } },
  { text: "[[Second point]]", options: { bullet: true, breakLine: true } },
  { text: "[[Third point]]", options: { bullet: true } },
], { placeholder: "body" });

s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Template" });
s.addText("[[Two-column slide: title]]", { placeholder: "title" });
s.addText([
  { text: "[[Left column heading]]", options: { bold: true, breakLine: true } },
  { text: "[[Left column text]]", options: { breakLine: true } },
], { x: 0.7, y: 1.7, w: 5.7, h: 4.8, fontSize: 16, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: "left-column" });
s.addShape(pres.ShapeType.roundRect, { x: 6.9, y: 1.7, w: 5.7, h: 4.8, rectRadius: 0.16, fill: { color: C.background2 }, line: { color: "E4E8EA", width: 0.75 } });
s.addText("[[Image, chart or callout]]", { x: 6.9, y: 1.7, w: 5.7, h: 4.8, fontSize: 14, color: C.accent4, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: "right-panel" });

s = pres.addSlide({ masterName: "CONTENT_PAPER", sectionTitle: "Template" });
s.addText("[[Stats slide: title]]", { placeholder: "title" });
statCard(s, 0.7, 2.1, 3.8, "[[0]]", "[[Metric one]]");
statCard(s, 4.75, 2.1, 3.8, "[[0]]", "[[Metric two]]");
statCard(s, 8.8, 2.1, 3.8, "[[0]]", "[[Metric three]]");
s.addText("Counters stay as placeholders until the team supplies real, verifiable numbers.", { x: 0.7, y: 4.7, w: 11.9, h: 0.4, fontSize: 12, color: C.accent4, margin: 0, isTextBox: true, objectName: "stats-note" });

s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Template" });
s.addText("[[Process slide: title]]", { placeholder: "title" });
[["[[Phase one]]", "[[What happens]]"], ["[[Phase two]]", "[[What happens]]"], ["[[Phase three]]", "[[What happens]]"]].forEach(([name, what], i) => {
  const x = 0.7 + i * 4.05;
  s.addShape(pres.ShapeType.roundRect, { x, y: 2.1, w: 3.8, h: 3.2, rectRadius: 0.16, fill: { color: C.background2 }, line: { color: "E4E8EA", width: 0.75 } });
  stepCircle(s, x + 0.35, 2.45, i + 1);
  s.addText(name, { x: x + 0.35, y: 3.25, w: 3.1, h: 0.5, fontSize: 20, fontFace: "Georgia", color: C.text1, margin: 0, isTextBox: true, objectName: `phase-${i + 1}-name` });
  s.addText(what, { x: x + 0.35, y: 3.8, w: 3.1, h: 1.3, fontSize: 14, color: C.accent4, margin: 0, valign: "top", isTextBox: true, objectName: `phase-${i + 1}-text` });
});

s = pres.addSlide({ masterName: "CLOSING", sectionTitle: "Template" });
s.addText("Thank you", { placeholder: "title" });
s.addText("[[One line on the next step and who takes it]]", { placeholder: "body" });
s.addText("[[presenter]] · +91 96240 46464 · [[email]]\n408, The Claywalls, Hebatpur Road, Thaltej, Ahmedabad, Gujarat 382455", { placeholder: "meta" });

(async () => {
  const out = path.join(__dirname, "iiic-template.pptx");
  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  console.log("wrote", out);
})();
