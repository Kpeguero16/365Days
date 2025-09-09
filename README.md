# For Us - Anniversary Website

A romantic, elegant website created as an anniversary gift featuring photos, poems, and memories organized by seasons and years.

## Features

- **Date Gate**: Enter your anniversary date to access the site
- **Welcome Experience**: Beautiful reveal after correct date entry
- **Timeline Navigation**: Sticky sidebar with season/year groupings and trip sub-sections
- **Scroll Experience**: Smooth section-by-section scrolling with gentle animations
- **Background Music**: Rauw Alejandro - Todo de Ti (user-gesture controlled)
- **Responsive Images**: Lazy-loaded with responsive srcset
- **Easter Eggs**: Hidden surprises throughout the site

## Easter Eggs

- **Triple-click** anywhere on content → Black cat confetti 🐈‍⬛
- **Press P** → Puppy confetti 🐶
- **Click "For Us"** brand → Heart confetti ❤️
- **Konami Code** (↑↑↓↓←→←→BA) → Surprise celebration 🎉

## Content Management

1. Add images to `assets/images/` (supports trips in subfolders)
2. Add videos to `assets/videos/`
3. Add poems/letters by editing `content.json`
4. Run `node tools/generate-manifest.js` to auto-generate from assets

## Deployment

This site is designed for GitHub Pages deployment. Simply push to your repository and enable GitHub Pages in settings.

## Technical Details

- Pure HTML/CSS/JavaScript (no frameworks)
- CSS Grid + Flexbox layout
- Intersection Observer for scroll effects
- Local storage for music preferences
- Lazy loading for performance
- Safari-optimized for MacBook Air 15"

## Content Structure

```json
{
  "items": [
    {
      "id": "unique_id",
      "type": "image|video|poem",
      "src": "assets/path/to/file",
      "date": "YYYY-MM-DD",
      "caption": "Description",
      "trip": "Trip Name (optional)"
    }
  ]
}
```

Built with ❤️ for our anniversary.
