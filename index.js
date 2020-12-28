const fs = require("fs");
const path = require("path");
const prompt = require("prompt");
const ytdl = require("ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
const thumbnailDownload = require("./download.js");
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
				mp3Title: {
					description: "What Would You Like to Title the File? (Leave Blank to Set File Name as Title)"
				},

			}
		}));

		if(!metaData.fileName.endsWith(".mp3")) metaData.fileName += ".mp3";
		console.log(`Audio will be saved in ${metaData.fileName}`);
		if(!metaData.mp3Title) metaData.mp3Title = metaData.fileName.slice(0, metaData.fileName.length - 4);
		console.log(`Title will be set as ${metaData.mp3Title}`);

		console.log("========== Download Started ==========");

		let downloadedPath = await ytDownload(info, url);
		downloadedPath = await convertToMp3(downloadedPath);
		downloadedPath = await addMetaData(downloadedPath, metaData);
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

async function convertToMp3(filePath) {
	return new Promise((resolve, reject) => {
		const newPath = path.resolve(__dirname, `downloads/temp.mp3`);
		const ffmpegProcess = ffmpeg(filePath);
		ffmpegProcess.format("mp3")
			.on("error", err => {
				console.log("Something went wrong while converting to MP3");
				reject(err);
			})
			.on("end", () => {
				console.log('========== MP3 Conversion Finished ==========');
				resolve(newPath);
			}).save(newPath);
		//ffmpegProcess.addOutputOption('-metadata', 'title="Mp3 Name"');
	});
}

async function addMetaData(mp3Path, metaData) {
	const saveTo = path.resolve(__dirname, `downloads/${metaData.fileName}`);
	return new Promise((resolve, reject) => {
		const renameProcess = ffmpeg(mp3Path);
		renameProcess
			.addOutputOptions('-i', path.resolve(__dirname, `downloads/cover.png`), '-map', '0:0', '-map', '1:0', '-c', 'copy', '-id3v2_version', '3')
			.on("end", err => {
				if(err) {
					console.warn("Something went wrong while adding a cover image");
					reject(err);
				}
				resolve(saveTo);
			})
			.save(saveTo);
	});
}

start().then(() => {
	console.log("========== Success! ==========");
}).catch(err => {
	console.warn("⚠⚠⚠ Something went wrong ⚠⚠⚠\n⚠⚠⚠ Shutting down ⚠⚠⚠");
	console.error(err);
	process.exit(1);
});