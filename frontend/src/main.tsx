import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThirdwebProvider } from 'thirdweb/react'
import './index.css'
import App from './App.tsx'
import { client } from './lib/thirdweb'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThirdwebProvider client={client}>
      <App />
    </ThirdwebProvider>
  </StrictMode>,
)
