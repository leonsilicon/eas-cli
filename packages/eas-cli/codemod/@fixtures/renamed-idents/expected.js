async function extractAppMetadataAsync(buildPath, platform) {
    let dc = false;
    let fingerprintHash;
    let simulator = platform === eas_build_job_1.Platform.IOS;
    const basePath = platform === eas_build_job_1.Platform.ANDROID ? 'assets/' : buildPath;
    const fingerprintFilePath = platform === eas_build_job_1.Platform.ANDROID ? 'fingerprint' : 'EXUpdates.bundle/fingerprint';
    const devMenuBundlePath = platform === eas_build_job_1.Platform.ANDROID ? 'EXDevMenuApp.android.js' : 'EXDevMenu.bundle/';
    const buildExtension = path_1.default.extname(buildPath);
    if (['.apk', '.aab'].includes(buildExtension)) {
        const z = new node_stream_zip_1.default.async({ file: buildPath });
        try {
            dc = Boolean(await z.entry(path_1.default.join(basePath, devMenuBundlePath)));
            if (!dc) {
                // Fallback: SDK 53+ no longer ships `assets/EXDevMenuApp.android.js` in dev-client APKs.
                // expo-dev-menu still bundles its native drawable (`res/drawable*/dev_menu_fab_icon.png`)
                // only when the library's debug source set is compiled in, i.e. dev-client builds.
                const allEntries = await z.entries();
                for (const entryName of Object.keys(allEntries)) {
                    if (/^res\/drawable[^/]*\/dev_menu_fab_icon\.[a-z0-9]+$/.test(entryName)) {
                        dc = true;
                        break;
                    }
                }
            }
            if (await z.entry(path_1.default.join(basePath, fingerprintFilePath))) {
                fingerprintHash = (await z.entryData(path_1.default.join(basePath, fingerprintFilePath))).toString('utf-8');
            }
        }
        finally {
            await z.close();
        }
    }
    return { developmentClient: dc, fingerprintHash, simulator };
}
