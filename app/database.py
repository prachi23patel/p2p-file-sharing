from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker , declarative_base
from dotenv import load_dotenv
import os

load_dotenv()

db_url = os.getenv("DATABASE_URL")

engine = create_engine(db_url , echo = False)

# Every time a request comes in: A new session is opened , Session does the database work (read/write), Session is closed after work is done
# Why close it after every request?To avoid memory leaks , To avoid too many open connections , To keep the app clean and fast
sessionLocal = sessionmaker(bind = engine)#Creates a “session blueprint”

Base = declarative_base()
# declarative_base() creates a parent class that allows SQLAlchemy to recognize and manage your Python classes as database tables.
def get_db():
    db = sessionLocal()# Creates a real session connected to DB
    try:
        yield db
    finally:
        db.close()
    # return:gives value → function ends immediately , session never gets closed 
    # yield: gives value → function PAUSES , router does its work , function RESUMES after router finishes , session gets closed 