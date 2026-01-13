# Topographic Airspace App

A Next.js web application for topographic airspace visualization, deployed on Vercel.

## Getting Started

First, install the dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Building for Production

To build the app for production:

```bash
npm run build
```

To start the production server:

```bash
npm start
```

## Deploying to Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new).

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket)
2. Import your repository on Vercel
3. Vercel will automatically detect Next.js and configure the build settings
4. Your app will be deployed!

Alternatively, you can use the [Vercel CLI](https://vercel.com/cli):

```bash
npm i -g vercel
vercel
```

## Project Structure

- `app/` - Next.js App Router directory
  - `layout.tsx` - Root layout component
  - `page.tsx` - Home page
  - `globals.css` - Global styles
- `next.config.js` - Next.js configuration
- `tsconfig.json` - TypeScript configuration
- `package.json` - Project dependencies and scripts

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)

