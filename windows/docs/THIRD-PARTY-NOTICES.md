# Third-party components

V2TT Client includes separately licensed software. The V2TT installer does not change the licenses of these components.

## sing-box

- Project: https://github.com/SagerNet/sing-box
- Version: 1.13.19
- Reported source revision: b5ebaa1fc0f2b94256180b95468e73ef53caa27d
- Source: https://github.com/SagerNet/sing-box/tree/b5ebaa1fc0f2b94256180b95468e73ef53caa27d
- Corresponding source archive: `vendor/sing-box-b5ebaa1.tar.gz` in the repository and source bundle for this release.
- License text: `LICENSES/sing-box.txt`

Preserve the source archive, build instructions and license when redistributing the bundled core. The source tree contains its own module dependency and build metadata.

## Routing databases

The binary rule files are `geoip-cn.srs` and `geosite-cn.srs`. Their SHA-256 hashes are recorded in the release verification report. They are local routing data, not real-time guarantees that every Chinese destination will be classified correctly.

- Repositories: https://github.com/SagerNet/sing-geoip and https://github.com/SagerNet/sing-geosite
- Repository license notices: `LICENSES/sing-geoip.txt` and `LICENSES/sing-geosite.txt`; full GPL text: `LICENSES/GPL-3.0.txt`.
- Editable JSON exported from the shipped databases is supplied in `vendor/rules` in the corresponding source bundle. Use `sing-box rule-set compile file.json` to compile it.

The core's reported revision was resolved against the official repository. Downloading a fresh official Windows archive for byte-for-byte comparison did not complete on the build network; the existing tested core was retained. Do not describe that binary as independently release-archive verified.

## Electron and JavaScript libraries

Electron includes Chromium and Node.js. Electron's `LICENSE` and `LICENSES.chromium.html` are shipped by the standard Electron distribution. JavaScript runtime dependencies include React, React DOM, Lucide React, https-proxy-agent and their transitive dependencies. Their available license texts are collected in `LICENSES/npm` and their versions are recorded in `package-lock.json`.

The installer also contains NSIS installer machinery supplied by electron-builder. Upstream projects retain their copyrights. No affiliation with these projects is implied.
