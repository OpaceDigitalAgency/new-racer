# Neon Dusk Circuit (Browser 3D Racing)

Browser-playable 3D racing game built with **Vite + Babylon.js** and deployable to **Netlify**.

## Features

- **Photorealistic Graphics**: Enhanced car models with detailed body, windows, spoilers, mirrors, and brake discs
- **Advanced Materials**: Clearcoat paint, chrome rims, and realistic glass windows
- **High-Quality Rendering**: Supersampling, MSAA, depth of field, and motion blur
- **Minimap**: Real-time track overview showing your position
- **Realistic Physics**: Arcade-style driving with responsive controls
- **Premium Car System**: Unlock flow with payment integration

## Play (Local)

```bash
npm install
npm run dev
```

## Controls

- Keyboard: `W` throttle, `S` brake/reverse, `A/D` steer, `R` reset, `Esc` back to menu
- Gamepad: left stick steer, RT throttle, LT brake
- Touch: drag left/right to steer, up/down for throttle/brake

## Premium Car (Prototype Unlock Flow)

- Payment link + unlock code are configured in `src/config.ts`.
- Unlock state is stored in `localStorage`.

## Deploy (Netlify)

- This repo includes `netlify.toml` (build command `npm run build`, publish dir `dist`).
- In Netlify: “New site from Git” → select repo → deploy.


---

## About Opace Digital Agency

This project is developed and maintained by **Opace Digital Agency**, a Birmingham-based web design and development agency specializing in modern web solutions.

### Our Services

- **Web Design & Development** - Professional, responsive websites
- **Next.js & React Development** - Modern web applications
- **Frontend Development** - Cutting-edge user interfaces
- **WordPress Development** - Custom themes and plugins
- **E-commerce Solutions** - Scalable online stores

### Get in Touch

- 🌐 Website: [opace.agency](https://opace.agency)
- 📧 Services: [Web Design & Development](https://opace.agency/services/web-design)
- 💼 GitHub: [@OpaceDigitalAgency](https://github.com/OpaceDigitalAgency)
- 📍 Location: Birmingham, UK
