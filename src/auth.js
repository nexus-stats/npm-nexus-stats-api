const io = require('socket.io-client')
const timeout = (fn, s) => {
  return new Promise(resolve => setTimeout(() => resolve(fn()), s))
}

/**
 * Handles authorization on cubic auth-node and token handling via HTTP
 */
class Auth {
  constructor (options) {
    this.options = options
    this.client = io.connect(this.options.auth_url + '/')
  }

  /**
   * Actual Request Code
   */
  async req (verb, query) {
    let res = await new Promise(resolve => this.client.emit(verb, query, resolve))
    try {
      res.body = JSON.parse(res.body)
    } catch (err) {
      throw res
    }

    if (res.body.error) {
      throw res
    } else {
      return res
    }
  }

  /**
   * Get tokens for API authentication if credentials are provided
   */
  async authorize (refresh = this.refresh_token) {
    if ((this.options.user_key && this.options.user_secret) || refresh) {
      return (refresh ? this.refreshToken() : this.getToken())
    }
  }

  /**
   * Get Token via http on /auth
   */
  async getToken () {
    const body = {
      user_key: this.options.user_key,
      user_secret: this.options.user_secret
    }

    try {
      let res = await this.req('POST', {
        url: '/authenticate',
        body
      })
      this.access_token = res.body.access_token
      this.refresh_token = res.body.refresh_token
    } catch (err) {
      let t = err.body.reason ? parseInt(err.body.reason.replace(/[^0-9]+/g, '')) : 500
      t = isNaN(t) ? 500 : t

      if (err.statusCode !== 503) {
        console.error('cubic-client encountered an error while authenticating:')
        console.error(err)
        console.error(`retrying in ${t}ms \n`)
      }
      await timeout(() => this.getToken(), t)
    }
  }

  /**
   * Get new access token from refresh_token & save in object
   */
  async refreshToken () {
    // Ensure only one refresh process is done at a time
    if (!this.refreshing) {
      this.refreshing = true
      let body = {
        refresh_token: this.refresh_token
      }

      // Send to /auth endpoint
      try {
        let res = await this.req('POST', {
          url: '/refresh',
          body
        })
        this.access_token = res.body.access_token
        this.refreshing = false
      } catch (err) {
        this.refreshing = false
        let t = err.body.reason ? parseInt(err.body.reason.replace(/[^0-9]+/g, '')) : 5000
        await timeout(() => this.refreshToken(), t)
      }
    }
  }
}

export default Auth
