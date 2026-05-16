const path = require("path");

class PdfFontManager {
  constructor(doc) {
    this.doc = doc;

    const base = path.join(process.cwd(), "public/fonts");

    this.fonts = {
      regular: path.join(base, "NotoSans/NotoSans-Regular.ttf"),
      bold: path.join(base, "NotoSans/NotoSans-Bold.ttf"),

      robotoBold: path.join(base, "RobotoBold/Roboto-Bold.ttf"),

      dejavu: path.join(base, "dejavu-sans/DejaVuSans.ttf"),
    };

    this.use("regular");
  }

  use(style = "regular") {
    const map = {
      regular: this.fonts.regular,
      bold: this.fonts.bold,
      robotoBold: this.fonts.robotoBold,
      dejavu: this.fonts.dejavu,
    };

    const fontPath = map[style];
    if (!fontPath) {
      throw new Error(`Font not found for style: ${style}`);
    }
    this.doc.font(fontPath || this.fonts.regular);
    return this;
  }

  text(text, options = {}) {
    this.doc.text(text, options);
    return this;
  }

  size(size) {
    this.doc.fontSize(size);
    return this;
  }

  color(color) {
    this.doc.fillColor(color);
    return this.doc;
  }
}

module.exports = { PdfFontManager };
