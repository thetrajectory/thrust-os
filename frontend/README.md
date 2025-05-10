# Trajectory - Lead Enrichment Platform

Trajectory is a powerful lead enrichment and qualification platform designed to help you identify and qualify prospects. The application processes leads through multiple enrichment steps and applies intelligent filtering to identify the most relevant prospects.

## System Requirements

- Node.js (v14.x or higher)
- npm (v6.x or higher) or yarn (v1.22.x or higher)
- Internet connection for API calls

## Project Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/trajectory.git
   cd trajectory
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Set up environment variables:
   - Copy `.env.template` to `.env`:
     ```bash
     cp .env.template .env
     ```
   - Edit the `.env` file and fill in your API keys and configuration values

4. Start the development server:
   ```bash
   npm start
   # or
   yarn start
   ```

## Environment Configuration

To use Trajectory, you need to set up the following API keys in your `.env` file:

- `REACT_APP_OPENAI_API_KEY`: Your OpenAI API key for title and company relevance analysis
- `REACT_APP_APOLLO_API_KEY`: Your Apollo API key for lead enrichment
- `REACT_APP_SERPER_API_KEY`: Your Serper API key for website scraping
- `REACT_APP_CORESIGNAL_API_KEY`: Your Coresignal API key for open jobs data
- `REACT_APP_SUPABASE_KEY`: Your Supabase key for database operations

## Enrichment Flow

Trajectory follows a specific enrichment flow:

1. **Title Relevance**: All data is processed and classified as "Founder", "Relevant", or "Irrelevant"
2. **Apollo Enrichment**: Only "Founder" and "Relevant" rows are processed
3. **Headcount Filter**: Only companies with 10-1500 employees pass this filter
4. **Domain Scraping**: Website content and sitemap extraction for companies that passed the headcount filter
5. **Company Relevance**: Analysis of companies and scoring on a 1-5 scale (only 3+ scores continue)
6. **Indian Leads**: Calculation of Indian employee percentage (must be <20% to continue)
7. **Open Jobs**: Collection of information about company job openings

## Output Data

The final CSV output contains only rows that passed through all filters. The CSV file includes:

- Lead information (name, title, contact details)
- Company information (name, industry, size)
- Enrichment data (title relevance, company relevance score, etc.)
- Analysis results (Indian headcount percentage, open jobs, etc.)

## Reports

Trajectory provides detailed reports on the enrichment process:

- Summary visualizations of the enrichment results
- Detailed filtering analytics at each step
- API usage statistics
- CSV report export with all metrics

## Customization

You can customize various aspects of the enrichment flow by editing the `.env` file:

- Batch sizes for API requests
- Model selections for OpenAI calls
- Filtering thresholds (e.g., Indian headcount percentage)
- Data staleness thresholds for database

## Security Notes

- Never commit your `.env` file with API keys to version control
- For production deployment, use proper environment variable management
- Consider implementing API key rotation for security
- Use appropriate authentication for your production application

## Architecture

The application is structured with the following components:

- **Services**: Modular enrichment services for each step
- **Orchestrator**: Coordinates the flow between services
- **UI Components**: React components for user interaction
- **Configuration**: Environment-based configuration

## Troubleshooting

If you encounter issues:

1. Check your API keys in the `.env` file
2. Verify your internet connection
3. Check the console logs for error messages
4. Make sure you have sufficient API credits for all services

## License

This project is licensed under the MIT License - see the LICENSE file for details.