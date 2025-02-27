# Frontend Project Guide

## Build & Run Commands
- Development server: `npm run dev`
- Build production: `npm run build`
- Start production: `npm run start`
- Lint code: `npm run lint`
- Test: `npm test`
- Test specific file: `npm test -- path/to/test.tsx`

## Code Style Guidelines
- **Imports**: Group in order: React, Next.js, external libraries, components, hooks, utils, types
- **Formatting**: TypeScript with strict mode, 2-space indentation
- **Components**: Use functional components with explicit type annotations
- **Styling**: Use Tailwind CSS for styling
- **Naming**:
  - PascalCase for components and types
  - camelCase for variables, functions, and hooks (prefix with 'use')
  - kebab-case for CSS classes and files

## Architecture
- Next.js app router (React Server Components)
- TypeScript for type safety
- Component structure: layout components, page components, UI components
- State management with React hooks and context
- Absolute imports with '@/' path alias

## Error Handling
- Use try/catch blocks for async operations
- Create error boundary components for UI error handling
- Implement proper form validation with clear user feedback
- Add descriptive alt text for images and aria attributes for accessibility