// Putting all the code in one file was intentional so it would be easier to copy and paste for testing
// Please don't kill me for this ;-;
// If you have to read the source code, I apologize lol

const fs = require("fs");
const path = require("path");
const https = require("https");
const ytdl = require("ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
const Set = require("prompt-set");
require("dotenv").config();

const config = {};

function loadConfig() {
	return new Promise((resolve, reject) => {
		fs.readFile(path.resolve(__dirname, "config.json"), (err, res) => {
			if(err) {
				if(err.code !== "ENOENT") {
					console.warn("Error reading file:")
					reject(err);
				}
				resolve(config);
			}
			Object.assign(config, JSON.parse(res.toString()));
			resolve(config);
		});
	});
}

async function metaDataPrompt(ytdlInfo) {
	await loadConfig();
	const metaData = await Set.PromptSet()
		.addNew([
			{
				name: "fileName",
				optionName: "Edit Filename",
				message: `What File Name Would You Like to Give the Audio File?${ytdlInfo ? ` <Suggested: ${ytdlInfo.videoDetails.title}>` : ""}`,
				validate: val => val.trim().length !== 0,
				editable: true
			},
			{
				name: "title",
				optionName: "Edit File Title",
				message: `What Would You Like to Title the File? (Leave Blank to Set File Name as Title)${ytdlInfo ? ` <Suggested: ${ytdlInfo.videoDetails.title}>` : ""}`,
				default: ytdlInfo.videoDetails.title,
				editable: true
			},
			{
				name: "coverLocation",
				optionName: "Edit Cover Image",
				message: "What Would You Like as the Cover Image? (Leave Blank for Video Thumbnail or Provide an Image URL)",
				editable: true
			},
			{
				name: "creator",
				optionName: "Edit Creator Name",
				message: `Who is the Creator? (Leave Blank to Skip)${ytdlInfo ? ` <Suggested: ${ytdlInfo.videoDetails.ownerChannelName}>` : ""}`,
				editable: true
			},
			{
				name: "album",
				optionName: "Edit Album Name",
				message: "What is the Album Name? (Leave Blank to Skip)",
				editable: true
			},
			{
				name: "track",
				optionName: "Edit Track Number",
				message: "What is the Track Number? (Leave Blank to Skip)",
				editable: true
			},
			{
				name: "genre",
				optionName: "Edit Genre",
				message: "What Genre? (Leave Blank to Skip)",
				editable: true
			},
			{
				name: "year",
				optionName: "Edit Release Year",
				message: `What Year was this Released? (Leave Blank to Skip)${ytdlInfo ? ` <Uploaded: ${ytdlInfo.videoDetails.uploadDate}>` : ""}`,
				validate: val => /^[12][0-9]{3}$/.test(val),
				editable: true
			}
		])
		.start();

	if(!metaData.fileName.endsWith(".mp3")) metaData.fileName += ".mp3";
	console.log(`Audio will be saved in ${metaData.fileName}`);
	if(!metaData.title) metaData.title = metaData.fileName.slice(0, metaData.fileName.length - 4);
	console.log(`Title will be set as ${metaData.title}`);

	// Messy Cover Image Download Code
	try {
		if(!metaData.coverLocation) {
			console.log("Downloading Thumbnail Image");
			// Code is depending on the download to fail and throw an error so it can be caught if no ytdlInfo is provided
			// Kinda bad style but it works
			metaData.coverLocation = await downloadThumbnail(ytdlInfo);
		} else {
			console.log("Downloading Image from URL");
			metaData.coverLocation = await downloadURL(metaData.coverLocation);
		}
	} catch(err) {
		metaData.coverLocation = process.env.DEFAULT_IMAGE_PATH || path.resolve(__dirname, "default.png");
		console.warn(`Failed to Download Image\nDefaulting to ${metaData.coverLocation}`);
	}

	return metaData;
}

async function start() {
	let { url } = await Set.PromptSet()
		.addNew({
			name: "url",
			optionName: "Youtube URL",
			message: "Paste the Youtube Video URL Here",
			validate: val => val.trim().length !== 0
		}).start();

	const info = await ytdl.getInfo(url);
	url = info.videoDetails.video_url;
	console.log(`Processed Youtube URL: ${url}`);

	const metaData = await metaDataPrompt(info);

	console.log("========== Download Started ==========");
	let downloadedPath = await ytDownload(info, url);
	console.log("========== Converting to MP3 =========");
	downloadedPath = await convertToMp3(downloadedPath, metaData);
	console.log(`Final Result Saved To: ${downloadedPath}`);
}

async function metaDataEdit() {
	let { filePath } = await Set.PromptSet()
		.addNew({
			name: "filePath",
			optionName: "File Path",
			message: "Paste the Absolute Path of the MP3 to Edit Here",
			validate: val => val.trim().length !== 0
		});

	console.warn("Note: If you are editing an MP3 file, you cannot give it the same file name if it will be saved to the same folder again or the data will be lost.");
	console.warn(`Editing file at ${filePath}`)
	const metaData = await metaDataPrompt();

	console.log("========== Converting to MP3 =========");
	filePath = await convertToMp3(filePath, metaData);
	console.log(`Final Result Saved To: ${filePath}`);
}

function ytDownload(info, url) {
	let format = ytdl.chooseFormat(info.formats, {
		quality: "highestaudio",
		filter: "audioonly"
	});
	const ytDownloadPath = path.resolve(__dirname, `downloads/temp.${format.container}`);
	let youtubeDownload = ytdl(url, { format: format });

	return new Promise((resolve, reject) => {
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

function downloadURL(imageURL) {
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

function convertToMp3(filePath, metaData) {
	const saveTo = path.resolve(process.env.SAVE_DESTINATION || path.resolve(__dirname, "downloads"), metaData.fileName);
	const ffmpegProcess = ffmpeg(filePath);

	return new Promise((resolve, reject) => {
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
		// checkAndSet("grouping");
		// checkAndSet("description");
		// checkAndSet("synopsis");
		// checkAndSet("network");
		// checkAndSet("show");
		// checkAndSet("episode_id");
		// checkAndSet("comment");
		// checkAndSet("copyright");
		// checkAndSet("lyrics");
		ffmpegProcess.save(saveTo);
	});
}

(Boolean(process.argv[2]) ? metaDataEdit : start)().then(() => {
	console.log("========== Success! ==========");
}).catch(err => {
	console.warn("⚠⚠⚠ Something went wrong ⚠⚠⚠\n⚠⚠⚠ Shutting down ⚠⚠⚠");
	console.error(err);
	process.exit(1);
});