# Nexus Launcher AUR Package (`nexus-launcher-bin`)

This directory contains the packaging files for the Arch User Repository (AUR).

## How to publish or update on AUR

1. **Clone the AUR repository:**

   ```bash
   git clone ssh://aur@aur.archlinux.org/nexus-launcher-bin.git
   ```

2. **Copy PKGBUILD & update checksums:**

   ```bash
   cp packaging/aur/PKGBUILD nexus-launcher-bin/
   cd nexus-launcher-bin
   updpkgsums
   makepkg --printsrcinfo > .SRCINFO
   ```

3. **Test build locally:**

   ```bash
   makepkg -si
   ```

4. **Commit and push to AUR:**
   ```bash
   git add PKGBUILD .SRCINFO
   git commit -m "Update to v0.3.0"
   git push origin master
   ```
