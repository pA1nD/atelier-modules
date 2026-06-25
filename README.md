# Atelier Modules

A small **public** Atelier marketplace bundling two apps:

- **atelier-chrome** — the default Atelier chrome: the rail, topbar, theme tokens, and `@atelier/kit` primitives that companion modules render against.
- **dock** — the marketplace browser & installer: add marketplaces (public or private), browse apps, and install them into any Atelier instance.

## Install Atelier

The one-command installer lives on the website:

```sh
curl -fsSL https://theatelier.dev/setup.sh | bash
```

It downloads the latest [Atelier shell](https://github.com/pA1nD/atelier), adds these modules, wires up a default `atelier.config.json` (port **1844**, `atelier-chrome` as the default chrome), installs dependencies, and starts the server on **http://localhost:1844**. See **https://theatelier.dev** for details.

## Use it as a marketplace

Add this repo as an uplink in **dock** — by `pA1nD/atelier-modules` or the clone URL — to install these apps into any existing Atelier instance.

## License

MIT — see [LICENSE](./LICENSE).
