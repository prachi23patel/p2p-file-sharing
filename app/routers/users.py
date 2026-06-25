from fastapi import APIRouter ,Depends , HTTPException , status 
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.users import User
from app.schemas.users import  UserResponse
from app.utils.jwt import verify_access_token
from fastapi.security import OAuth2PasswordBearer

router = APIRouter(prefix="/users", tags=["users"])
# below line Extract Bearer token from Authorization header /auth/login tells that token comes from /auth/login
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# this function fetches current user_id from the token and authorises the user
# without this function we need to send user_id fron frontend everytime
def get_current_user(token: str = Depends(oauth2_scheme) , db : Session = Depends(get_db)):
    # print(token)
    payload = verify_access_token(token)
    # print(payload)
    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )
    user_id = str(payload["sub"])
    # The "sub" value in the JWT payload is usually stored as a string, but the database ID is typically an integer. So we convert it to an integer to correctly match and query the user in the database.
    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )
    return user

# Depends(get_current_user) is a dependency that tells FastAPI to execute the get_current_user function before the endpoint runs. It is used to authenticate the user, and if successful, it returns the current user to the endpoint. If authentication fails, it raises an error and stops the request.
@router.get("/me" , response_model=UserResponse)
def get_me(current_user :User = Depends(get_current_user)):
    return current_user

@router.get("/{id}", response_model=UserResponse)
def det_user(id : str , db: Session = Depends(get_db),current_user : User = Depends(get_current_user)):
    user = db.query(User).filter(User.id == id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user

# What “Not authenticated” actually means
# 1 - No Authorization header - No token sent
# 2 - Wrong header format 
# 3 - Token not passed through client (Postman/Frontend) - Forgot to add token or Wrong tab in Postman

# error 401 and 403 meanings
# A 401 Unauthorized error means the user is not authenticated, either due to missing or invalid credentials. A 403 Forbidden error means the user is authenticated but does not have permission to access the requested resource.

# If a token works during login but fails in a protected endpoint like /me, it could be due to the token not being sent properly, being invalid or expired, a mismatch in secret key or algorithm, incorrect payload handling, or failure to find the user in the database.

# What is the difference between JWT authentication and session-based authentication?
# JWT authentication is stateless, meaning the server does not store session data and the client sends a token with each request, which is verified using a secret key. Session-based authentication is stateful, where the server stores session data and the client sends a session ID, usually via cookies. JWT is more scalable, while session-based authentication is easier to manage and revoke.