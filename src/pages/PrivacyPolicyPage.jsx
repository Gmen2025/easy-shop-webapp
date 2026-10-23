import { useEffect } from 'react'

function PrivacyPolicyPage() {
  useEffect(() => {
    window.location.replace('/privacy.html')
  }, [])

  return <p>Opening the <a href="/privacy.html">Privacy Policy</a>.</p>
}

export default PrivacyPolicyPage