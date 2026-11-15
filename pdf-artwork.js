// Convert photos and PDFs locally into printable images.
(function () {
  var artwork = { logo: null, signature: null };
  var revision = { logo: 0, signature: 0 };
  var pending = new Set();
  var library;
  function sync() {
    ["logo", "signature"].forEach(function (kind) {
      var value = artwork[kind];
      var image = $("p-" + kind);
      if (value) image.src = value.data;
      else image.removeAttribute("src");
      image.hidden = !value;
      $("remove-" + kind).hidden = !value && !pending.has(kind);
    });
    $("pdf").disabled = pending.size > 0;
  }
  function changed() {
    sync();
    document.dispatchEvent(new Event("artworkchange"));
  }
  window.invoiceArtwork = {
    get: function () { return JSON.parse(JSON.stringify(artwork)); },
    restore: function (saved) {
      ["logo", "signature"].forEach(function (kind) {
        revision[kind]++;
        pending.delete(kind);
        var value = saved && saved[kind];
        artwork[kind] = value && /^data:image\/png;base64,/.test(value.data) ? value : null;
        $(kind).value = "";
        $(kind + "-status").textContent = artwork[kind] ? artwork[kind].name : "Choose a photo or PDF (up to 10 MB). PDFs use the first page.";
      });
      sync();
    },
    busy: function () { return pending.size > 0; }
  };
  async function pdfLibrary() {
    if (!library) {
      library = import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs").then(function (pdfjs) {
        pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
        return pdfjs;
      }).catch(function (error) { library = null; throw error; });
    }
    return library;
  }
  async function photoData(file) {
    var url = URL.createObjectURL(file);
    try {
      var photo = new Image();
      photo.src = url;
      await photo.decode();
      var scale = Math.min(1, 900 / Math.max(photo.naturalWidth, photo.naturalHeight));
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
      canvas.getContext("2d").drawImage(photo, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    } catch (error) {
      throw new Error("Choose a supported photo such as JPG, PNG or WebP. This image could not be read.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  // Trim empty PDF margins so a signature on a full sheet remains legible.
  function trim(canvas) {
    var context = canvas.getContext("2d");
    var pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    var left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (var y = 0; y < canvas.height; y++) {
      for (var x = 0; x < canvas.width; x++) {
        var i = (y * canvas.width + x) * 4;
        if (pixels[i + 3] > 10 && Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 245) {
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
    }
    if (right < left) throw new Error("The first PDF page is blank. Choose a PDF containing your artwork.");
    var cropped = document.createElement("canvas");
    var width = right - left + 1, height = bottom - top + 1;
    var scale = Math.min(1, 900 / Math.max(width, height));
    cropped.width = Math.ceil(width * scale) + 8;
    cropped.height = Math.ceil(height * scale) + 8;
    var output = cropped.getContext("2d");
    output.fillStyle = "white";
    output.fillRect(0, 0, cropped.width, cropped.height);
    output.drawImage(canvas, left, top, width, height, 4, 4, cropped.width - 8, cropped.height - 8);
    return cropped.toDataURL("image/png");
  }
  ["logo", "signature"].forEach(function (kind) {
    $("remove-" + kind).addEventListener("click", function () {
      revision[kind]++;
      pending.delete(kind);
      artwork[kind] = null;
      $(kind).value = "";
      $(kind + "-status").textContent = "Choose a photo or PDF (up to 10 MB). PDFs use the first page.";
      changed();
    });
    $(kind).addEventListener("change", async function () {
      var file = this.files[0];
      if (!file) return;
      var token = ++revision[kind];
      var task;
      pending.add(kind);
      sync();
      $(kind + "-status").textContent = "Loading artwork…";
      try {
        var isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
        if (!isPdf && !/^image\//i.test(file.type) && !/\.(jpe?g|png|webp|gif|bmp|avif|svg)$/i.test(file.name)) throw new Error("Choose a photo or PDF file.");
        if (file.size > 10 * 1024 * 1024) throw new Error("Choose a photo or PDF smaller than 10 MB.");
        var data;
        if (!isPdf) {
          data = await photoData(file);
        } else {
        var pdfjs = await pdfLibrary();
        task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
        task.onPassword = function () { task.destroy(); };
        var pdf = await task.promise;
        var page = await pdf.getPage(1);
        var original = page.getViewport({ scale: 1 });
        var viewport = page.getViewport({ scale: 1800 / Math.max(original.width, original.height) });
        var canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport, background: "white" }).promise;
        data = trim(canvas);
        }
        var decoded = new Image();
        decoded.src = data;
        await decoded.decode();
        if (token !== revision[kind]) return;
        artwork[kind] = { name: file.name, data: data };
        $(kind + "-status").textContent = file.name + (isPdf ? " — first page added." : " — photo added.");
      } catch (error) {
        if (token !== revision[kind]) return;
        $(kind + "-status").textContent = /^(Choose|The first)/.test(error.message) ? error.message : "Could not read PDF. Use an unlocked, valid PDF and check your internet connection.";
      } finally {
        if (task) task.destroy();
        if (token === revision[kind]) {
          pending.delete(kind);
          $(kind).value = "";
          changed();
        }
      }
    });
  });
})();
