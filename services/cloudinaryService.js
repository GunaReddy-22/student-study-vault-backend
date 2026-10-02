const cloudinary = require("cloudinary").v2;

// Configure Cloudinary from environment
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Check if Cloudinary is configured
 */
function isConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

/**
 * Upload a base64 image or data URI to Cloudinary
 * @param {string} dataUri Base64 data URI (e.g. data:image/png;base64,...)
 * @param {string} folder Target folder in Cloudinary
 * @returns {Promise<{success: boolean, url: string, publicId?: string, error?: string}>}
 */
async function uploadBase64Image(dataUri, folder = "studyvault_notes") {
  if (!isConfigured()) {
    console.warn("⚠️ Cloudinary credentials not fully configured in .env");
    return { success: false, url: dataUri, reason: "Cloudinary credentials missing" };
  }

  try {
    const uploadRes = await cloudinary.uploader.upload(dataUri, {
      folder: folder,
      resource_type: "image",
      format: "png",
      transformation: [{ quality: "auto:eco" }, { fetch_format: "auto" }],
    });

    return {
      success: true,
      url: uploadRes.secure_url,
      publicId: uploadRes.public_id,
    };
  } catch (err) {
    console.error("❌ Cloudinary upload error:", err.message);
    // Graceful fallback: return the original dataUri so user note isn't lost
    return {
      success: false,
      url: dataUri,
      error: err.message,
    };
  }
}

/**
 * Upload buffer or stream
 */
async function uploadBuffer(buffer, folder = "studyvault_assets") {
  return new Promise((resolve, reject) => {
    if (!isConfigured()) {
      return reject(new Error("Cloudinary not configured"));
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "auto" },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );

    uploadStream.end(buffer);
  });
}

module.exports = {
  cloudinary,
  isConfigured,
  uploadBase64Image,
  uploadBuffer,
};
