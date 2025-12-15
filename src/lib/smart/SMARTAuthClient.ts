/**
 * SMART on FHIR Authentication Client
 * 
 * Implements the SMART App Launch Framework:
 * - Standalone launch
 * - EHR launch (context from EHR)
 * - OAuth2 authorization flow
 * - Token management
 * 
 * @see https://docs.smarthealthit.org/
 */

// ============================================
// TYPES
// ============================================

export interface SMARTConfig {
    clientId: string;
    redirectUri: string;
    scope: string;
    iss?: string; // FHIR server base URL (set during EHR launch)
}

export interface SMARTMetadata {
    authorizationEndpoint: string;
    tokenEndpoint: string;
    registrationEndpoint?: string;
    introspectionEndpoint?: string;
    revocationEndpoint?: string;
    capabilities: string[];
}

export interface SMARTTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
    scope: string;
    patient?: string; // Patient ID in context
    encounter?: string; // Encounter ID in context
    id_token?: string;
    need_patient_banner?: boolean;
    smart_style_url?: string;
}

export interface SMARTLaunchContext {
    patient?: string;
    encounter?: string;
    user?: string;
    fhirUser?: string;
}

export interface SMARTAuthState {
    state: string;
    codeVerifier: string;
    iss: string;
    redirectUri: string;
}

// ============================================
// PKCE HELPERS
// ============================================

function generateRandomString(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const randomValues = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(randomValues, (v) => charset[v % charset.length]).join('');
}

async function sha256(plain: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return crypto.subtle.digest('SHA-256', data);
}

function base64UrlEncode(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
    const hashed = await sha256(verifier);
    return base64UrlEncode(hashed);
}

// ============================================
// STORAGE HELPERS
// ============================================

const STORAGE_KEY_AUTH_STATE = 'smart_auth_state';
const STORAGE_KEY_TOKEN = 'smart_token';

function saveAuthState(state: SMARTAuthState): void {
    sessionStorage.setItem(STORAGE_KEY_AUTH_STATE, JSON.stringify(state));
}

function loadAuthState(): SMARTAuthState | null {
    const stored = sessionStorage.getItem(STORAGE_KEY_AUTH_STATE);
    if (!stored) return null;
    return JSON.parse(stored);
}

function clearAuthState(): void {
    sessionStorage.removeItem(STORAGE_KEY_AUTH_STATE);
}

function saveToken(token: SMARTTokenResponse): void {
    const expiry = Date.now() + token.expires_in * 1000;
    sessionStorage.setItem(STORAGE_KEY_TOKEN, JSON.stringify({ ...token, expiry }));
}

function loadToken(): (SMARTTokenResponse & { expiry: number }) | null {
    const stored = sessionStorage.getItem(STORAGE_KEY_TOKEN);
    if (!stored) return null;
    return JSON.parse(stored);
}

function clearToken(): void {
    sessionStorage.removeItem(STORAGE_KEY_TOKEN);
}

// ============================================
// SMART CLIENT CLASS
// ============================================

export class SMARTAuthClient {
    private config: SMARTConfig;
    private metadata: SMARTMetadata | null = null;

    constructor(config: SMARTConfig) {
        this.config = config;
    }

    /**
     * Discover SMART metadata from FHIR server
     */
    async discoverMetadata(fhirBaseUrl: string): Promise<SMARTMetadata> {
        // First try the .well-known endpoint
        try {
            const wellKnownUrl = `${fhirBaseUrl}/.well-known/smart-configuration`;
            const response = await fetch(wellKnownUrl);

            if (response.ok) {
                const data = await response.json();
                this.metadata = {
                    authorizationEndpoint: data.authorization_endpoint,
                    tokenEndpoint: data.token_endpoint,
                    registrationEndpoint: data.registration_endpoint,
                    introspectionEndpoint: data.introspection_endpoint,
                    revocationEndpoint: data.revocation_endpoint,
                    capabilities: data.capabilities || [],
                };
                return this.metadata;
            }
        } catch {
            // Fall through to try CapabilityStatement
        }

        // Fallback: parse from CapabilityStatement
        const metadataUrl = `${fhirBaseUrl}/metadata`;
        const response = await fetch(metadataUrl, {
            headers: { Accept: 'application/fhir+json' },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch FHIR metadata: ${response.status}`);
        }

        const capability = await response.json();
        const oauth = capability.rest?.[0]?.security?.extension?.find(
            (e: any) => e.url === 'http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris'
        );

        if (!oauth) {
            throw new Error('SMART on FHIR not supported by this server');
        }

        const getExtValue = (url: string) =>
            oauth.extension?.find((e: any) => e.url === url)?.valueUri;

        this.metadata = {
            authorizationEndpoint: getExtValue('authorize'),
            tokenEndpoint: getExtValue('token'),
            registrationEndpoint: getExtValue('register'),
            revocationEndpoint: getExtValue('revoke'),
            capabilities: [],
        };

        if (!this.metadata.authorizationEndpoint || !this.metadata.tokenEndpoint) {
            throw new Error('Required SMART endpoints not found');
        }

        return this.metadata;
    }

    /**
     * Start the authorization flow (redirect to auth server)
     */
    async authorize(fhirBaseUrl: string, launchToken?: string): Promise<void> {
        // Discover metadata
        await this.discoverMetadata(fhirBaseUrl);

        if (!this.metadata) {
            throw new Error('Metadata not loaded');
        }

        // Generate PKCE values
        const codeVerifier = generateRandomString(64);
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        const state = generateRandomString(32);

        // Save state for callback
        saveAuthState({
            state,
            codeVerifier,
            iss: fhirBaseUrl,
            redirectUri: this.config.redirectUri,
        });

        // Build authorization URL
        const authUrl = new URL(this.metadata.authorizationEndpoint);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', this.config.clientId);
        authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
        authUrl.searchParams.set('scope', this.config.scope);
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('aud', fhirBaseUrl);
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');

        // Add launch token if present (EHR launch)
        if (launchToken) {
            authUrl.searchParams.set('launch', launchToken);
        }

        // Redirect to authorization server
        window.location.href = authUrl.toString();
    }

    /**
     * Handle the authorization callback
     */
    async handleCallback(callbackUrl: string): Promise<SMARTTokenResponse> {
        const url = new URL(callbackUrl);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        if (error) {
            const errorDesc = url.searchParams.get('error_description');
            throw new Error(`Authorization failed: ${error} - ${errorDesc}`);
        }

        if (!code || !state) {
            throw new Error('Missing code or state parameter');
        }

        // Load saved state
        const savedState = loadAuthState();
        if (!savedState || savedState.state !== state) {
            throw new Error('State mismatch - possible CSRF attack');
        }

        // Discover metadata for token endpoint
        await this.discoverMetadata(savedState.iss);

        if (!this.metadata) {
            throw new Error('Metadata not loaded');
        }

        // Exchange code for token
        const tokenResponse = await fetch(this.metadata.tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: savedState.redirectUri,
                client_id: this.config.clientId,
                code_verifier: savedState.codeVerifier,
            }),
        });

        if (!tokenResponse.ok) {
            const errorBody = await tokenResponse.text();
            throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorBody}`);
        }

        const token: SMARTTokenResponse = await tokenResponse.json();

        // Save token and clear auth state
        saveToken(token);
        clearAuthState();

        return token;
    }

    /**
     * Refresh the access token
     */
    async refreshToken(): Promise<SMARTTokenResponse | null> {
        const currentToken = loadToken();
        if (!currentToken?.refresh_token) {
            return null;
        }

        if (!this.metadata) {
            throw new Error('Metadata not loaded');
        }

        const response = await fetch(this.metadata.tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: currentToken.refresh_token,
                client_id: this.config.clientId,
            }),
        });

        if (!response.ok) {
            clearToken();
            return null;
        }

        const newToken: SMARTTokenResponse = await response.json();
        saveToken(newToken);
        return newToken;
    }

    /**
     * Get the current access token (refresh if needed)
     */
    async getAccessToken(): Promise<string | null> {
        const token = loadToken();
        if (!token) return null;

        // Check if token is expired or about to expire (5 min buffer)
        if (token.expiry - Date.now() < 5 * 60 * 1000) {
            const refreshed = await this.refreshToken();
            return refreshed?.access_token || null;
        }

        return token.access_token;
    }

    /**
     * Get the current launch context
     */
    getLaunchContext(): SMARTLaunchContext | null {
        const token = loadToken();
        if (!token) return null;

        return {
            patient: token.patient,
            encounter: token.encounter,
        };
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated(): boolean {
        const token = loadToken();
        return !!token && token.expiry > Date.now();
    }

    /**
     * Logout - clear all tokens
     */
    logout(): void {
        clearToken();
        clearAuthState();
    }
}

// ============================================
// FACTORY
// ============================================

export function createSMARTClient(config: SMARTConfig): SMARTAuthClient {
    return new SMARTAuthClient(config);
}

export default SMARTAuthClient;
