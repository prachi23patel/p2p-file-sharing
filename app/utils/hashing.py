from pwdlib import PasswordHash

# creating object 
obj = PasswordHash.recommended() # This automatically uses the best and most secure settings

# hash password
def hash_password(password):
    hashed = obj.hash(password)
    return hashed

# verify password
def verify_password(plain , hashed):
    return obj.verify(plain , hashed)
