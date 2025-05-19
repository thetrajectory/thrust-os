// fileStorageService.jsx
import Papa from 'papaparse';

class FileStorageService {
    constructor() {
        this.processedData = null;
        this.tempFileHandles = {};
    }

    // Store processed data in memory but prepare it for CSV export
    storeProcessedData(data) {
        this.processedData = data;
        return true;
    }

    // Get the processed data (still needed for UI display)
    getProcessedData() {
        return this.processedData || [];
    }

    // Generate and download CSV directly without storing in session
    downloadProcessedDataCsv(data, filename = null) {
        if (!data || data.length === 0) {
            console.error('No processed data to download');
            return { success: false, error: 'No data to download' };
        }

        try {
            // Prepare flattened data (same logic as in reportsService)
            const flattenedData = this._prepareFlattenedData(data);

            // Convert data to CSV
            const csv = Papa.unparse(flattenedData);

            // Set default filename if not provided
            const defaultFilename = `advisor_finder_data_${new Date().toISOString().slice(0, 10)}.csv`;
            const finalFilename = filename || defaultFilename;

            // Create and download file
            this._downloadCsv(csv, finalFilename);

            return { success: true, message: `Downloaded ${data.length} records` };
        } catch (error) {
            console.error('Error downloading processed data CSV:', error);
            return { success: false, error: error.message };
        }
    }

    // Prepare flattened data structure for CSV (from reportsService)
    _prepareFlattenedData(data) {
        return data.map(row => {
            // Same flattening logic as in reportsService.jsx
            const flatRow = {
                // Default columns
                first_name: row.first_name || row.person?.first_name || row['person.first_name'] || '',
                last_name: row.last_name || row.person?.last_name || row['person.last_name'] || '',
                linkedin_url: row.linkedin_url || row.person?.linkedin_url || row['person.linkedin_url'] || '',
                email_address: row.email || row.person?.email || row['person.email'] || '',
                company: row.company || row.organization?.name || row['organization.name'] || '',
                position: row.position || row.person?.title || row['person.title'] || '',
                connected_on: row.connected_on || '',
                connection_time: row.connectionTime || '', // Added connection time

                // Tag column
                tag: row.relevanceTag || '',

                // Title relevance data
                titleRelevance: row.titleRelevance || '',

                // Connection Time Analysis
                connectionTime: row.connectionTime || '',

                // Apollo enrichment fields - person
                'person.id': row['person.id'] || '',
                'person.first_name': row['person.first_name'] || row.person?.first_name || '',
                'person.last_name': row['person.last_name'] || row.person?.last_name || '',
                'person.name': row['person.name'] || row.person?.name || '',
                'person.linkedin_url': row['person.linkedin_url'] || row.person?.linkedin_url || '',
                'person.title': row['person.title'] || row.person?.title || '',
                'person.headline': row['person.headline'] || row.person?.headline || '',
                'person.email': row['person.email'] || row.person?.email || '',
                'person.email_status': row['person.email_status'] || row.person?.email_status || '',
                'person.photo_url': row['person.photo_url'] || row.person?.photo_url || '',
                'person.twitter_url': row['person.twitter_url'] || row.person?.twitter_url || '',
                'person.github_url': row['person.github_url'] || row.person?.github_url || '',
                'person.facebook_url': row['person.facebook_url'] || row.person?.facebook_url || '',
                'person.extrapolated_email_confidence': row['person.extrapolated_email_confidence'] || row.person?.extrapolated_email_confidence || '',
                'person.organization_id': row['person.organization_id'] || row.person?.organization_id || '',
                'person.state': row['person.state'] || row.person?.state || '',
                'person.city': row['person.city'] || row.person?.city || '',
                'person.country': row['person.country'] || row.person?.country || '',
                'person.departments': row['person.departments'] || (Array.isArray(row.person?.departments) ? row.person.departments.join(', ') : row.person?.departments || ''),
                'person.subdepartments': row['person.subdepartments'] || (Array.isArray(row.person?.subdepartments) ? row.person.subdepartments.join(', ') : row.person?.subdepartments || ''),
                'person.functions': row['person.functions'] || (Array.isArray(row.person?.functions) ? row.person.functions.join(', ') : row.person?.functions || ''),
                'person.seniority': row['person.seniority'] || row.person?.seniority || '',

                // Education and employment
                employment_history_summary: row.employment_history_summary || '',

                // Organization fields
                'organization.id': row['organization.id'] || row.organization?.id || '',
                'organization.name': row['organization.name'] || row.organization?.name || '',
                'organization.website_url': row['organization.website_url'] || row.organization?.website_url || '',
                'organization.linkedin_url': row['organization.linkedin_url'] || row.organization?.linkedin_url || '',
                'organization.industry': row['organization.industry'] || row.organization?.industry || '',
                'organization.estimated_num_employees': row['organization.estimated_num_employees'] || row.organization?.estimated_num_employees || '',
                'organization.short_description': row['organization.short_description'] || row.organization?.short_description || '',

                // Raw OpenAI advisor analysis response
                advisorAnalysisResponse: row.advisorAnalysisResponse || '',
                customer: row.advisorAnalysisResponse ?
                    row.advisorAnalysisResponse.split('~')[0]?.replace(/Customer:\s*/i, '').trim() : '',

                seniority: row.advisorAnalysisResponse ?
                    row.advisorAnalysisResponse.split('~')[1]?.trim() : '',

                experience_relevance: row.advisorAnalysisResponse ?
                    row.advisorAnalysisResponse.split('~')[2]?.trim() : '',
            };
            return flatRow;
        });
    }

    // Helper function to download CSV (from reportsService)
    _downloadCsv(csvContent, filename) {
        // Create blob with CSV content
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 100);
    }
}

// Create and export a singleton instance
const fileStorageService = new FileStorageService();
export default fileStorageService;