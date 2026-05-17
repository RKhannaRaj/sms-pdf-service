const path = require("path");

class PdfFontManager {
  constructor(doc) {
    this.doc = doc;

    const base = path.join(process.cwd(), "public/fonts");

    // 1. Explicitly register the font family name inside PDFKit
    this.doc.registerFont(
      "Inter-Thin",
      path.join(base, "NotoSans/NotoSansDevanagari-Regular.ttf"),
    );
    this.doc.registerFont(
      "Inter-Bold",
      path.join(base, "NotoSans/NotoSans-Bold.ttf"),
    );
    this.doc.registerFont(
      "Roboto-Bold",
      path.join(base, "RobotoBold/Roboto-Bold.ttf"),
    );
    this.doc.registerFont(
      "DejaVuSans",
      path.join(base, "dejavu-sans/DejaVuSans.ttf"),
    );

    // 2. Maintain your style map pointing directly to those registered family names
    this.fonts = {
      regular: "NotoSansDevanagari-Regular",
      bold: "NotoSans-Bold",
      robotoBold: "Roboto-Bold",
      dejavu: "DejaVuSans",
    };

    this.use("regular");
  }

  use(style = "regular") {
    const fontName = this.fonts[style];

    if (!fontName) {
      throw new Error(`Font not found for style: ${style}`);
    }

    // Call PDFKit with the registered name, not the file system path string
    this.doc.font(fontName);

    return this;
  }
}

module.exports = { PdfFontManager };

// const path = require("path");

// class PdfFontManager {
//   constructor(doc) {
//     this.doc = doc;

//     const base = path.join(process.cwd(), "public/fonts");

//     this.fonts = {
//       regular: path.join(base, "inter/Inter-Regular.ttf"),

//       bold: path.join(base, "inter/Inter-Bold.ttf"),

//       robotoBold: path.join(base, "RobotoBold/Roboto-Bold.ttf"),

//       dejavu: path.join(base, "dejavu-sans/DejaVuSans.ttf"),

//       devanagari: path.join(base, "NotoSansDevanagari-Regular.ttf"),
//     };

//     this.use("regular");
//   }

//   use(style = "regular") {
//     const map = {
//       regular: this.fonts.regular,
//       bold: this.fonts.bold,
//       robotoBold: this.fonts.robotoBold,
//       dejavu: this.fonts.dejavu,
//       devanagari: this.fonts.devanagari,
//     };

//     const fontPath = map[style];

//     if (!fontPath) {
//       throw new Error(`Font not found for style: ${style}`);
//     }

//     this.doc.font(fontPath);

//     return this;
//   }
// }

// module.exports = { PdfFontManager };
