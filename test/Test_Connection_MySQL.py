import mysql.connector
from mysql.connector import Error
from dotenv import load_dotenv
import os

load_dotenv('../.env')

def test_connection():
    try:
        db_host = os.getenv('DB_HOST')
        db_user = os.getenv('DB_USER')
        db_password = os.getenv('DB_PASSWORD')
        db_name = os.getenv('DB_NAME')
        db_port = os.getenv('DB_PORT')

        connection = mysql.connector.connect(
            host=db_host,
            database=db_name,
            user=db_user,
            password=db_password,
            port=db_port,
        )

        if connection.is_connected():
            print("Connection to the database is successful!")
    
    except Error as e:
        print(f"Error: {e}")
    
    finally:
        if connection.is_connected():
            connection.close()
            print("MySQL connection is closed.")

# Run the test connection function
test_connection()
