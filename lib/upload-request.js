export function uploadFormDataWithProgress({ url, token, body, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("POST", url);
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }

      const nextProgress = Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100)));
      onProgress?.(nextProgress);
    };

    xhr.onload = () => {
      let payload = {};
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        payload = {};
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(payload);
        return;
      }

      if (xhr.status === 413) {
        reject(
          new Error(
            "This upload is too large for the deployed upload route. Vercel limits request bodies to about 4.5 MB, so media files need to upload directly to Supabase Storage.",
          ),
        );
        return;
      }

      reject(new Error(payload?.error || "Upload failed."));
    };

    xhr.onerror = () =>
      reject(
        new Error(
          "Upload failed before the server returned a response. If this file is larger than a few MB on the deployed site, it is probably hitting Vercel's request body limit.",
        ),
      );
    xhr.onabort = () => reject(new Error("Upload canceled."));

    xhr.send(body);
  });
}
