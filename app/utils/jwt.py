import jwt
from datetime import datetime , timedelta
import os
from dotenv import load_dotenv

load_dotenv()
secret_key = os.getenv("SECRET_KEY")
algo = os.getenv("ALGORITHM")
acc_time = os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES")

def create_access_token(data):     #  data (dictionary containing user id)
    payload = data.copy()
    print(payload)
    # current time + access token expire time
    # exp_time = datetime + acc_time     # datetime is a class → you cannot add to the class itself
    exp_time = datetime.utcnow() + timedelta(minutes=int(acc_time))
    # datetime.utcnow() → gives current time
    # timedelta(minutes=...) → adds minutes to current time
    # int(acc_time) → because os.getenv() returns string → convert to int
    payload["exp"] = exp_time # added exp_time to dictionary data
    encoded = jwt.encode(payload , secret_key , algorithm=algo)    # encoding data with secrete key and algorithm
    return encoded

def verify_access_token(token):
    try :
        decoded = jwt.decode(token, secret_key , algorithms=[algo])
        # jwt.decode():
        # It automatically checks if token is expired
        # If expired → it raises an error automatically
        # You just need to catch that error
        return decoded
    except Exception as e:
        print("error" , e)
        return None
    # If verify_access_token() returns None, it means JWT decoding failed. This can happen due to an invalid or corrupted token, mismatched secret key or algorithm, expired token, or incorrect token format.

# encode uses
# algorithm = ALGORITHM        # single string

# decode uses
# algorithms = [ALGORITHM]     # list of strings

