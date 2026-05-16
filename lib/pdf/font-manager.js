const path = require("path");

class PdfFontManager {
  constructor(doc) {
    this.doc = doc;

    const base = path.join(process.cwd(), "public/fonts");

    this.fonts = {
      regular: path.join(base, "Noto_Sans/NotoSans-Regular.ttf"),
      bold: path.join(base, "Noto_Sans/NotoSans-Bold.ttf"),

      robotoRegular: path.join(base, "Roboto/Roboto-Regular.ttf"),
      robotoBold: path.join(base, "Roboto/Roboto-Bold.ttf"),

      dejavu: path.join(base, "dejavu-sans/DejaVuSans.ttf"),
    };

    this.use("regular");
  }

  use(style = "regular") {
    const map = {
      regular: this.fonts.regular,
      bold: this.fonts.bold,
      roboto: this.fonts.robotoRegular,
      robotoBold: this.fonts.robotoBold,
      dejavu: this.fonts.dejavu,
    };

    this.doc.font(map[style] || this.fonts.regular);
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
    return this;
  }
}

module.exports = { PdfFontManager };
