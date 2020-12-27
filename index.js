const fs = require("fs");
const path = require("path");
const prompt = require("prompt");
const ytdl = require("ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
require("dotenv").config();

prompt.message = "";
prompt.start();

async function start() {
	return new Promise(async(resolve, reject) => {
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

		let outputFile = (await prompt.get("What File Name Would You Like to Give the Audio File?"))["What File Name Would You Like to Give the Audio File?"];
		if(!outputFile.endsWith(".mp3")) outputFile += ".mp3";
		console.log(`Audio will be saved in ${outputFile}`);

		console.log("========== Download Started ==========");

		// console.log(Object.keys(info.videoDetails));
		let format = ytdl.chooseFormat(info.formats, {
			quality: "highestaudio",
			filter: "audioonly"
		});

		let youtubeDownload = ytdl(url, {format: format});
		youtubeDownload.on("finish", err => {
			if(err) {
				console.warn("Something went wrong while downloading video");
				console.error(err);
			}
			console.log("Youtube Download Complete");

			// Note: I might have on("end", err => {}) wrong. It might be on("error", err => {})
			const ffmpegProcess = ffmpeg(path.resolve(__dirname, `downloads/temp.${format.container}`));
			// const ffmpegProcess = ffmpeg(path.resolve(__dirname, "downloads/temp.webm"));
			ffmpegProcess.format("mp3")
				.on("end", err => {
					if(err) {
						console.log("Something went wrong while converting to MP3");
						reject(err);
					}
					console.log('========== MP3 Conversion Finished ==========');
					const renameProcess = ffmpeg(path.resolve(__dirname, `downloads/temp.mp3`));
					renameProcess
						.addOutputOptions('-i', path.resolve(__dirname, `downloads/cover.png`), '-map', '0:0', '-map', '1:0', '-c', 'copy', '-id3v2_version', '3')
						.on("end", err => {
							if(err) {
								console.warn("Something went wrong while adding a cover image");
								reject(err);
							}
							resolve();
						})
						.save(path.resolve(__dirname, `downloads/${outputFile}`));
					// .save(path.resolve(__dirname, "downloads/finalTemp.mp3"));
				}).save(path.resolve(__dirname, `downloads/temp.mp3`));

			//ffmpegProcess.addOutputOption('-metadata', 'title="Song Name"');
		});
		// See https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/417 for removing the need to write to file first
		youtubeDownload
			.pipe(fs.createWriteStream(path.resolve(__dirname, `downloads/temp.${format.container}`)));
	});
}

start().then(() => {
	console.log("========== Success! ==========");
}).catch(err => {
	console.warn("⚠⚠⚠ Something went wrong ⚠⚠⚠\n⚠⚠⚠ Shutting down ⚠⚠⚠");
	console.error(err);
	process.exit(1);
});