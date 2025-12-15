/**
 * FHIR Client - Generic FHIR R4 API Client
 * 
 * Provides methods for:
 * - CRUD operations on FHIR resources
 * - Search with parameters
 * - Batch/transaction bundles
 * - Authentication handling
 */

// ============================================
// TYPES
// ============================================

export type FHIRResourceType =
    | 'Patient'
    | 'Observation'
    | 'Condition'
    | 'MedicationRequest'
    | 'MedicationStatement'
    | 'AllergyIntolerance'
    | 'Procedure'
    | 'DiagnosticReport'
    | 'Encounter'
    | 'Bundle';

export interface FHIRResource {
    resourceType: FHIRResourceType;
    id?: string;
    meta?: {
        versionId?: string;
        lastUpdated?: string;
        profile?: string[];
    };
    [key: string]: unknown;
}

export interface FHIRBundle {
    resourceType: 'Bundle';
    type: 'searchset' | 'batch' | 'transaction' | 'collection';
    total?: number;
    link?: Array<{
        relation: string;
        url: string;
    }>;
    entry?: Array<{
        fullUrl?: string;
        resource?: FHIRResource;
        request?: {
            method: 'GET' | 'POST' | 'PUT' | 'DELETE';
            url: string;
        };
        response?: {
            status: string;
            location?: string;
        };
    }>;
}

export interface FHIRSearchParams {
    [key: string]: string | string[] | number | boolean | undefined;
}

export interface FHIRClientConfig {
    baseUrl: string;
    authToken?: string;
    clientId?: string;
    clientSecret?: string;
    timeout?: number;
}

export interface FHIROperationOutcome {
    resourceType: 'OperationOutcome';
    issue: Array<{
        severity: 'fatal' | 'error' | 'warning' | 'information';
        code: string;
        diagnostics?: string;
        details?: {
            text?: string;
        };
    }>;
}

// ============================================
// FHIR CLIENT CLASS
// ============================================

export class FHIRClient {
    private baseUrl: string;
    private authToken?: string;
    private timeout: number;

    constructor(config: FHIRClientConfig) {
        this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
        this.authToken = config.authToken;
        this.timeout = config.timeout || 30000;
    }

    // ----------------------------------------
    // HTTP Methods
    // ----------------------------------------

    private async request<T>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        path: string,
        body?: unknown
    ): Promise<T> {
        const url = `${this.baseUrl}${path}`;

        const headers: Record<string, string> = {
            'Content-Type': 'application/fhir+json',
            'Accept': 'application/fhir+json',
        };

        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorBody = await response.json().catch(() => null);
                throw new FHIRError(
                    `FHIR request failed: ${response.status} ${response.statusText}`,
                    response.status,
                    errorBody as FHIROperationOutcome | null
                );
            }

            // Handle 204 No Content
            if (response.status === 204) {
                return {} as T;
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof FHIRError) throw error;
            throw new FHIRError(
                `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                0,
                null
            );
        }
    }

    // ----------------------------------------
    // CRUD Operations
    // ----------------------------------------

    /**
     * Read a single resource by ID
     */
    async read<T extends FHIRResource>(
        resourceType: FHIRResourceType,
        id: string
    ): Promise<T> {
        return this.request<T>('GET', `/${resourceType}/${id}`);
    }

    /**
     * Read a specific version of a resource
     */
    async vread<T extends FHIRResource>(
        resourceType: FHIRResourceType,
        id: string,
        versionId: string
    ): Promise<T> {
        return this.request<T>('GET', `/${resourceType}/${id}/_history/${versionId}`);
    }

    /**
     * Create a new resource
     */
    async create<T extends FHIRResource>(resource: T): Promise<T> {
        return this.request<T>('POST', `/${resource.resourceType}`, resource);
    }

    /**
     * Update an existing resource
     */
    async update<T extends FHIRResource>(resource: T): Promise<T> {
        if (!resource.id) {
            throw new FHIRError('Resource must have an id for update', 400, null);
        }
        return this.request<T>('PUT', `/${resource.resourceType}/${resource.id}`, resource);
    }

    /**
     * Delete a resource
     */
    async delete(resourceType: FHIRResourceType, id: string): Promise<void> {
        await this.request<void>('DELETE', `/${resourceType}/${id}`);
    }

    // ----------------------------------------
    // Search Operations
    // ----------------------------------------

    /**
     * Search for resources
     */
    async search(
        resourceType: FHIRResourceType,
        params?: FHIRSearchParams
    ): Promise<FHIRBundle> {
        const searchParams = new URLSearchParams();

        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (value === undefined) return;
                if (Array.isArray(value)) {
                    value.forEach(v => searchParams.append(key, String(v)));
                } else {
                    searchParams.append(key, String(value));
                }
            });
        }

        const queryString = searchParams.toString();
        const path = `/${resourceType}${queryString ? `?${queryString}` : ''}`;

        return this.request<FHIRBundle>('GET', path);
    }

    /**
     * Get all resources matching search (handles pagination)
     */
    async searchAll(
        resourceType: FHIRResourceType,
        params?: FHIRSearchParams
    ): Promise<FHIRResource[]> {
        const resources: FHIRResource[] = [];
        let bundle = await this.search(resourceType, params);

        while (bundle.entry) {
            for (const entry of bundle.entry) {
                if (entry.resource) {
                    resources.push(entry.resource);
                }
            }

            // Check for next page
            const nextLink = bundle.link?.find(l => l.relation === 'next');
            if (nextLink) {
                bundle = await this.request<FHIRBundle>('GET', nextLink.url.replace(this.baseUrl, ''));
            } else {
                break;
            }
        }

        return resources;
    }

    // ----------------------------------------
    // Batch/Transaction Operations
    // ----------------------------------------

    /**
     * Execute a batch or transaction bundle
     */
    async batch(bundle: FHIRBundle): Promise<FHIRBundle> {
        if (bundle.type !== 'batch' && bundle.type !== 'transaction') {
            throw new FHIRError('Bundle must be of type batch or transaction', 400, null);
        }
        return this.request<FHIRBundle>('POST', '/', bundle);
    }

    // ----------------------------------------
    // Convenience Methods
    // ----------------------------------------

    /**
     * Search patients by identifier
     */
    async findPatientByIdentifier(system: string, value: string): Promise<FHIRResource | null> {
        const bundle = await this.search('Patient', {
            identifier: `${system}|${value}`,
        });
        return bundle.entry?.[0]?.resource || null;
    }

    /**
     * Get all observations for a patient
     */
    async getPatientObservations(patientId: string): Promise<FHIRResource[]> {
        return this.searchAll('Observation', {
            patient: patientId,
            _sort: '-date',
        });
    }

    /**
     * Get all conditions for a patient
     */
    async getPatientConditions(patientId: string): Promise<FHIRResource[]> {
        return this.searchAll('Condition', {
            patient: patientId,
        });
    }

    /**
     * Get all medications for a patient
     */
    async getPatientMedications(patientId: string): Promise<FHIRResource[]> {
        return this.searchAll('MedicationRequest', {
            patient: patientId,
            status: 'active',
        });
    }

    /**
     * Get all allergies for a patient
     */
    async getPatientAllergies(patientId: string): Promise<FHIRResource[]> {
        return this.searchAll('AllergyIntolerance', {
            patient: patientId,
        });
    }

    // ----------------------------------------
    // Auth Methods
    // ----------------------------------------

    /**
     * Set the auth token
     */
    setAuthToken(token: string): void {
        this.authToken = token;
    }

    /**
     * Clear the auth token
     */
    clearAuthToken(): void {
        this.authToken = undefined;
    }

    /**
     * Get capability statement (metadata)
     */
    async getCapabilityStatement(): Promise<FHIRResource> {
        return this.request<FHIRResource>('GET', '/metadata');
    }
}

// ============================================
// CUSTOM ERROR
// ============================================

export class FHIRError extends Error {
    public statusCode: number;
    public operationOutcome: FHIROperationOutcome | null;

    constructor(
        message: string,
        statusCode: number,
        operationOutcome: FHIROperationOutcome | null
    ) {
        super(message);
        this.name = 'FHIRError';
        this.statusCode = statusCode;
        this.operationOutcome = operationOutcome;
    }

    get issues(): string[] {
        if (!this.operationOutcome) return [];
        return this.operationOutcome.issue.map(
            i => i.diagnostics || i.details?.text || i.code
        );
    }
}

// ============================================
// FACTORY FUNCTION
// ============================================

export function createFHIRClient(config: FHIRClientConfig): FHIRClient {
    return new FHIRClient(config);
}

export default FHIRClient;
