![SignalMirage Banner](SignalMirage-plugin/git-banner-signalmirage.png)

# SignalMirage

SignalMirage is a free and open-source Photoshop plugin for transmission-based dithering, diffusion, texture, and contamination effects.

The plugin currently includes:

- Atkinson, Floyd-Steinberg, threshold, and printer-drift style engines
- Two-color and four-color palettes
- threshold, diffusion, signal response, and transmission clarity controls
- edge character and contamination controls
- optional live visual preview support

## Project Structure

```text
SignalMirage/
  SignalMirage-plugin/
    manifest.json
    index.html
    main.js
    style.css
    icon.png
    logo-84.png
```

## Installing For Local Testing

SignalMirage is a UXP-style Photoshop panel. To test it locally:

1. Open Adobe UXP Developer Tool.
2. Choose **Add Plugin**.
3. Select `SignalMirage-plugin/manifest.json`.
4. Load the plugin.
5. Open it in Photoshop from the Plugins menu.

## Status

This is an early public version of SignalMirage. Expect changes as the plugin grows.

## License

SignalMirage is released under the MIT License. See [LICENSE](LICENSE) for details.
