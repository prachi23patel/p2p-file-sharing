from pydantic import BaseModel , EmailStr , ConfigDict , Field
from uuid import UUID

class UserCreate(BaseModel):
    username : str
    email : EmailStr
    password : str 

class UserLogin(BaseModel):
    email : str
    password : str 

class UserResponse(BaseModel):
    # id : UUID
    username : str
    email : EmailStr
    model_config = ConfigDict(from_attributes=True)
    # When you fetch data from database → SQLAlchemy returns an SQLAlchemy object
    # When you want to send data back to user → Pydantic needs a dictionary can't directly read object

    # SQLAlchemy gives you → User object
    # Pydantic sees from_attributes=True
    # Pydantic reads object attributes directly → SUCCESS 
    # Converts to proper response automatically