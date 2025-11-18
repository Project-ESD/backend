import { createApp, createIdentityProvider } from '@kottster/server';
import schema from '../../kottster-app.json';

/* 
 * For security, consider moving the secret data to environment variables.
 * See https://kottster.app/docs/deploying#before-you-deploy
 */
export const app = createApp({
  schema,
  secretKey: 'YskUIg8QH2LMuCx5mk_xUAbS9PQRQYxO',
  kottsterApiToken: 'zCJ7qIHalEPTPmsI4PUIzWl2g75iYz3k',

  /*
   * The identity provider configuration.
   * See https://kottster.app/docs/app-configuration/identity-provider
   */
  identityProvider: createIdentityProvider('sqlite', {
    fileName: 'app.db',

    passwordHashAlgorithm: 'bcrypt',
    jwtSecretSalt: 'DgyhrfnASzZd3QDB',
    
    /* The root admin user credentials */
    rootUsername: 'admin',
    rootPassword: 'vurquj-joqnYp-modxi7',
  }),
});