const fs = require("fs");
const path = require("path");
const https = require("https");
const prompt = require("prompt");
const ytdl = require("ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
require("dotenv").config();

prompt.message = "";
prompt.start();

async function start() {
	return new Promise(async resolve => {
		let {url} = await prompt.get({
			properties: {
				url: {
					description: "Paste the Youtube Video URL Here"
				}
			}
		});

		const info = await ytdl.getInfo(url);
		url = info.videoDetails.video_url;
		console.log(`Processed Youtube URL: ${url}`);

		let metaData = (await prompt.get({
			properties: {
				fileName: {
					description: "What File Name Would You Like to Give the Audio File?"
				},
				title: {
					description: "What Would You Like to Title the File? (Leave Blank to Set File Name as Title)"
				},
				coverLocation: {
					description: "What Would You Like as the Cover Image? (Leave Blank for Video Thumbnail or Provide an Image URL)"
				},
				creator: {
					description: "Who is the Creator? (Leave Blank to Skip)"
				},
				album: {
					description: "What is the Album Name? (Leave Blank to Skip)"
				},
				track: {
					description: "What is the Track Number? (Leave Blank to Skip)"
				},
				genre: {
					description: "What Genre? (Leave Blank to Skip)"
				},
				year: {
					description: "What Year was this Released? (Leave Blank to Skip)"
				}
			}
		}));

		if(!metaData.fileName.endsWith(".mp3")) metaData.fileName += ".mp3";
		console.log(`Audio will be saved in ${metaData.fileName}`);
		if(!metaData.title) metaData.title = metaData.fileName.slice(0, metaData.fileName.length - 4);
		console.log(`Title will be set as ${metaData.title}`);
		try {
			if(!metaData.coverLocation) {
				console.log("Downloading Thumbnail Image");
				metaData.coverLocation = await downloadThumbnail(info);
			} else {
				console.log("Downloading Image from URL");
				metaData.coverLocation = await downloadURL(metaData.coverLocation);
			}
		} catch(err) {
			metaData.coverLocation = process.env.DEFAULT_IMAGE_PATH || path.resolve(__dirname, "default.png");
			console.warn(`Failed to Download Image\nUsing Default If Provided: ${metaData.coverLocation}`);
			if(!metaData.coverLocation) throw "No Default Cover Image Provided";
		}

		console.log("========== Download Started ==========");
		let downloadedPath = await ytDownload(info, url);
		console.log("========== Converting to MP3 ==========");
		downloadedPath = await convertToMp3(downloadedPath, metaData);
		console.log(`Final Result Saved To: ${downloadedPath}`);
		resolve();
	});
}

async function ytDownload(info, url) {
	return new Promise((resolve, reject) => {
		let format = ytdl.chooseFormat(info.formats, {
			quality: "highestaudio",
			filter: "audioonly"
		});

		const ytDownloadPath = path.resolve(__dirname, `downloads/temp.${format.container}`);
		let youtubeDownload = ytdl(url, {format: format});

		youtubeDownload.on("error", err => {
			console.warn("Something went wrong while downloading video");
			reject(err);
		});

		youtubeDownload.on("finish", () => {
			console.log("Youtube Download Complete");
			resolve(ytDownloadPath);
		});

		// See https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/417 for removing the need to write to file first
		youtubeDownload
			.pipe(fs.createWriteStream(ytDownloadPath));
	});
}

async function downloadThumbnail(YoutubeVideoInfo) {
	let imageURL;

	if(!imageURL) {
		const thumbnails = YoutubeVideoInfo.videoDetails.thumbnails;
		let selectedThumbnail = thumbnails[0];
		for(const thumbnail of thumbnails) {
			selectedThumbnail = thumbnail.width > selectedThumbnail.width ? thumbnail : selectedThumbnail;
		}
		imageURL = selectedThumbnail.url;
	}

	return downloadURL(imageURL);
}

async function downloadURL(imageURL) {
	return new Promise(async(resolve, reject) => {
		https.get(imageURL, res => {
			const imagePath = path.resolve(__dirname, `downloads/thumbnail.${res.headers["content-type"].split("/")[1]}`);
			const writeTo = fs.createWriteStream(imagePath);
			res.on("end", () => {
				console.log("Download End");
				resolve(imagePath);
			});
			res.on("error", err => {
				console.warn("Error encountered while downloading image");
				reject(err);
			})
			res.pipe(writeTo);
		})
	});
}

async function convertToMp3(filePath, metaData) {
	return new Promise((resolve, reject) => {
		const saveTo = path.resolve(process.env.SAVE_DESTINATION || path.resolve(__dirname, "downloads"), metaData.fileName);
		const ffmpegProcess = ffmpeg(filePath);
		ffmpegProcess
			.addOutputOptions('-i', path.resolve(__dirname, metaData.coverLocation))
			.format("mp3")
			.on("error", err => {
				console.log("Something went wrong while converting to MP3");
				reject(err);
			})
			.on("end", () => {
				console.log('========== Converted ==========');
				resolve(saveTo);
			})
			.addOutputOptions('-map', '0:0', '-map', '1:0', '-id3v2_version', '3');

		// Attaching additional/optional metadata
		const checkAndSet = (prop, name) => {
			if(!name) name = prop;
			if(metaData[prop]) ffmpegProcess.addOutputOptions('-metadata', `${name}=${metaData[prop]}`);
		};
		checkAndSet("creator", "author");
		checkAndSet("creator", "composer");
		checkAndSet("creator", "artist");
		checkAndSet("creator", "album_artist");
		checkAndSet("title");
		checkAndSet("album");
		checkAndSet("track");
		checkAndSet("genre");
		checkAndSet("year");
		ffmpegProcess.save(saveTo);
	});
}

start().then(() => {
	console.log("========== Success! ==========");
}).catch(err => {
	console.warn("⚠⚠⚠ Something went wrong ⚠⚠⚠\n⚠⚠⚠ Shutting down ⚠⚠⚠");
	console.error(err);
	process.exit(1);
});