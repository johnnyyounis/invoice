// Start a fresh invoice. Use Save as PDF to keep a copy before resetting.
(function () {
  var fields = ["biz", "no", "cli", "dt", "disc", "vat", "rate"];
  $("new").addEventListener("click", function () {
    invoiceArtwork.restore(null);
    fields.forEach(function (id) { $(id).value = ""; });
    items = [{ d: "", q: "", p: "" }];
    drawEditor();
    drawPreview();
    $("biz").focus();
  });
})();
