async function extractAppMetadataAsync(buildPath, platform) {
  let developmentClient = false;
  let fingerprintHash;
  let simulator = platform === eas_build_job_1.Platform.IOS;
  let appName;
  let appIdentifier;
  const basePath = platform === eas_build_job_1.Platform.ANDROID ? 'assets/' : buildPath;
  const fingerprintFilePath =
    platform === eas_build_job_1.Platform.ANDROID ? 'fingerprint' : 'EXUpdates.bundle/fingerprint';
  const devMenuBundlePath =
    platform === eas_build_job_1.Platform.ANDROID ? 'EXDevMenuApp.android.js' : 'EXDevMenu.bundle/';
  const buildExtension = path_1.default.extname(buildPath);
  if (['.apk', '.aab'].includes(buildExtension)) {
    const zip = new node_stream_zip_1.default.async({ file: buildPath });
    try {
      developmentClient = Boolean(
        await zip.entry(path_1.default.join(basePath, devMenuBundlePath))
      );
      if (await zip.entry(path_1.default.join(basePath, fingerprintFilePath))) {
        fingerprintHash = (
          await zip.entryData(path_1.default.join(basePath, fingerprintFilePath))
        ).toString('utf-8');
      }
    } catch (err) {
      log_1.default.error(`Error reading ${buildExtension}: ${err}`);
    } finally {
      await zip.close();
    }
  }
  return { developmentClient, fingerprintHash, simulator, appName, appIdentifier };
}
