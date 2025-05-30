// services/sqlFunctions.js
import supabase from './supabaseClient';

export async function createSqlFunctions() {
  try {
    // Create function to get unique advisors
    const { error } = await supabase.rpc('exec_sql', {
      sql_statement: `
        CREATE OR REPLACE FUNCTION get_unique_advisors()
        RETURNS TABLE (connected_to text) AS $$
        BEGIN
          RETURN QUERY SELECT DISTINCT connected_to 
          FROM leads_db 
          WHERE connected_to IS NOT NULL AND connected_to != '';
        END;
        $$ LANGUAGE plpgsql;
      `
    });
    
    if (error) {
      console.error("Error creating SQL function:", error);
    } else {
      console.log("SQL function created successfully");
    }
  } catch (err) {
    console.error("Error in createSqlFunctions:", err);
  }
}

// Helper function to execute SQL directly
export async function executeRawSql(sql) {
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_statement: sql
    });
    
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("Error executing SQL:", err);
    throw err;
  }
}