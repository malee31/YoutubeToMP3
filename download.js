const fs = require("fs");
const path = require("path");
const https = require("https");
require("dotenv").config();

async function downloadThumbnail(YoutubeVideoInfo) {
	return new Promise(async(resolve, reject) => {
		let imageURL;

		if(!imageURL) {
			const thumbnails = YoutubeVideoInfo.videoDetails.thumbnails;
			let selectedThumbnail = thumbnails[0];
			for(const thumbnail of thumbnails) {
				selectedThumbnail = thumbnail.width > selectedThumbnail.width ? thumbnail : selectedThumbnail;
			}
			imageURL = selectedThumbnail.url;
		}

		https.get(imageURL, res => {
			const imagePath = path.resolve(__dirname, `downloads/thumbnail.${res.headers["content-type"].split("/")[1]}`);
			const writeTo = fs.createWriteStream(imagePath);
			res.on("end", () => {
				console.log("Download End");
				resolve(imagePath);
			});
			res.on("error", err => {
				console.warn("Error encountered while downloading thumbnail");
				reject(err);
			})
			res.pipe(writeTo);
		})
	});
}

module.exports = downloadThumbnail;