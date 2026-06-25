# Atelier Modules

A small **public** Atelier marketplace bundling two apps:

- **atelier-chrome** — the default Atelier chrome: the rail, topbar, theme tokens, and `@atelier/kit` primitives that companion modules render against.
- **dock** — the marketplace browser & installer: add marketplaces (public or private), browse apps, and install them into any Atelier instance.

## Quick start

```sh
git clone https://github.com/pa1nd/atelier-modules.git
cd atelier-modules
./setup.sh
```

`setup.sh` will:

1. download the latest [Atelier shell](https://github.com/pA1nD/atelier),
2. drop both modules into a fresh instance,
3. write a default `atelier.config.json` (port **1844**, `atelier-chrome` as the default chrome), and
4. install the shell's dependencies.

Then start it:

```sh
cd atelier-instance/atelier && ATELIER_ROOT="$(cd .. && pwd)" npm run dev
# open http://localhost:1844
```

## Use it as a marketplace

Add this repo as an uplink in **dock** — by `pa1nd/atelier-modules` or the clone URL — to install these apps into any existing Atelier instance.

## License

MIT — see [LICENSE](./LICENSE).
