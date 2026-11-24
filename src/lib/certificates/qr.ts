import QRCode from 'qrcode'

/**
 * The QR code on a certificate (docs/18 §4): made on the server as SVG by `qrcode`, error
 * correction M, so it is part of the page before the PDF is printed and no third party ever sees
 * the link. The kit sizes it (20 mm, src/brand/css/05-print.css `.iiic-cert-qr`); the modules are
 * the kit's ink on white, with one module of quiet zone inside the box and the sheet's white
 * around it.
 */

/** The kit's ink (--iiic-ink), written out because the SVG is printed outside the page's CSS. */
const INK = '#1C262B'

export async function qrSvg(url: string): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: INK, light: '#FFFFFF' },
  })
  // The template sits the code in a labelled box; the drawing itself is decoration.
  return svg.trim().replace(/^<svg /, '<svg aria-hidden="true" focusable="false" ')
}
