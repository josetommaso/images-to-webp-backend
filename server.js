const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs-extra');
const archiver = require('archiver');
const cors = require('cors');

const app = express();
app.use(cors());
const upload = multer({ dest: 'uploads/' });

app.post('/upload', upload.array('images'), async (req, res) => {
	const uploadPath = 'uploads/';

	try {
		const files = req.files;

		// Create a unique folder for each upload
		const uniqueFolderName = Date.now().toString();
		const uniqueFolderPath = path.join(uploadPath, uniqueFolderName);
		await fs.ensureDir(uniqueFolderPath);

		// Handle the uploaded files and save them inside the unique folder
		await handleUploadedFiles(files, uniqueFolderPath);

		// Convert the images to WebP
		const webpImages = await convertImagesToWebP(uniqueFolderPath);

		// Zip the WebP files
		const zipFilePath = await zipWebPFiles(webpImages, uniqueFolderPath);

		// Send the zip file as a response
		res.download(zipFilePath, 'webp_images.zip', (err) => {
			// ...

			// Delete the unique folder after 10 seconds
			setTimeout(() => {
				fs.remove(uniqueFolderPath)
					.then(() => {
						console.log(`Deleted folder: ${uniqueFolderPath}`);
					})
					.catch((err) => {
						console.error(`Error deleting folder: ${uniqueFolderPath}`, err);
					});
			}, 10000);
		});
	} catch (error) {
		console.error('Error uploading, converting, and zipping images:', error);
		res.status(500).json({
			error: 'An error occurred during image upload, conversion, and zip',
		});
	}
});

const handleUploadedFiles = async (files, uploadPath) => {
	const uploadPromises = files.map((file) => {
		const filePath = path.join(uploadPath, file.originalname); // Use original filename

		return fs
			.move(file.path, filePath) // Move the file to the unique folder
			.then(() => console.log(`File uploaded: ${filePath}`))
			.catch((error) =>
				console.error(`Error uploading file: ${file.originalname}`, error)
			);
	});

	await Promise.all(uploadPromises);
	console.log('All files uploaded successfully.');
};

const convertImagesToWebP = async (uploadPath) => {
	const files = fs.readdirSync(uploadPath);
	const webpImages = [];

	for (const file of files) {
		const filePath = path.join(uploadPath, file);

		if (/\.(jpg|jpeg|png)$/i.test(file)) {
			const outputPath = filePath.replace(/\.[^.]+$/, '.webp');
			await sharp(filePath).toFormat('webp').toFile(outputPath);
			console.log(`Image converted to WebP: ${filePath} -> ${outputPath}`);
			webpImages.push(outputPath);
		}
	}

	console.log('All images converted to WebP successfully!');
	return webpImages;
};

const zipWebPFiles = async (webpImages, uploadPath) => {
	const zipFilePath = path.join(uploadPath, 'webp_images.zip');
	const output = fs.createWriteStream(zipFilePath);
	const archive = archiver('zip', { zlib: { level: 5 } });

	return new Promise((resolve, reject) => {
		output.on('close', () => {
			console.log('WebP images zipped successfully!');
			resolve(zipFilePath);
		});

		archive.on('warning', (error) => {
			if (error.code === 'ENOENT') {
				// log warning
				console.warn('Zip warning:', error);
			} else {
				// throw error
				reject(error);
			}
		});

		archive.on('error', (error) => {
			reject(error);
		});

		archive.pipe(output);

		for (const webpImage of webpImages) {
			const fileExt = path.extname(webpImage);
			if (fileExt.toLowerCase() === '.webp') {
				const fileName = path.basename(webpImage);
				archive.file(webpImage, { name: fileName });
			}
		}

		archive.finalize();
	});
};

// Start the server
app.listen(3000, () => {
	console.log('Server is running on port 3000');
});
