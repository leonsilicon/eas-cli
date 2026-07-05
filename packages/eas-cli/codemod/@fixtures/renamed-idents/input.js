async function extractAppMetadataAsync(buildPath, platform) {
  let dc = false;
  let fingerprintHash;
  let simulator = platform === eas_build_job_1.Platform.IOS;
  const basePath = platform === eas_build_job_1.Platform.ANDROID ? 'assets/' : buildPath;
  const fingerprintFilePath =
    platform === eas_build_job_1.Platform.ANDROID ? 'fingerprint' : 'EXUpdates.bundle/fingerprint';
  const devMenuBundlePath =
    platform === eas_build_job_1.Platform.ANDROID ? 'EXDevMenuApp.android.js' : 'EXDevMenu.bundle/';
  const buildExtension = path_1.default.extname(buildPath);
  if (['.apk', '.aab'].includes(buildExtension)) {
    const z = new node_stream_zip_1.default.async({ file: buildPath });
    try {
      dc = Boolean(await z.entry(path_1.default.join(basePath, devMenuBundlePath)));
      if (await z.entry(path_1.default.join(basePath, fingerprintFilePath))) {
        fingerprintHash = (
          await z.entryData(path_1.default.join(basePath, fingerprintFilePath))
        ).toString('utf-8');
      }
    } finally {
      await z.close();
    }
  }
  return { developmentClient: dc, fingerprintHash, simulator };
}
