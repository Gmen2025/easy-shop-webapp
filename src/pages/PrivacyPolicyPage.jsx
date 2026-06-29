function PrivacyPolicyPage() {
  return (
    <section className="page-stack profile-page">
      <section className="hero-panel">
        <p className="eyebrow">Privacy and Account</p>
        <h1>Privacy Policy</h1>
        <p>How Addu Genet Easy Shop handles customer details inside this storefront.</p>
      </section>

      <article className="panel">
        <dl className="profile-details">
          <div>
            <dt>Data use</dt>
            <dd>
              We use your profile details to process orders, support requests, and account access.
            </dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>
              Profile information is stored in your selected store backend and in the browser session.
            </dd>
          </div>
          <div>
            <dt>Account deletion</dt>
            <dd>Delete the account from Edit Profile to clear local sign-in data in this browser.</dd>
          </div>
        </dl>
      </article>
    </section>
  )
}

export default PrivacyPolicyPage